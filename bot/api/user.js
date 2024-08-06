import ApplicationModel from '../../models/Application.model.js';
import { Markup } from 'telegraf';
import multer from "multer";
import path, { dirname } from "path";
import fs from 'fs'
import { fileURLToPath } from "url";
import { format, parseISO, isValid } from 'date-fns'
import { ru } from 'date-fns/locale'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const uploadDirectory = path.join(__dirname, '../../api/uploads')

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true })
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDirectory)
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    }
})
const upload = multer({ storage: storage })

const normalizeDate = (date) => {
    if (date instanceof Date) {
        return date
    }
    if (typeof date === 'string') {
        let parsedDate = parseISO(date)
        if (!isValid(parsedDate)) {
            parsedDate = new Date(date)
        }
        return parsedDate
    }
    return null
}

export const setDateToAnswer = (app, bot) => {
    app.post("/api/application/set-date/:id", async (req, res) => {
        const { id } = req.params
        const { _id, date } = req.body;
        console.log()
        try {
            const application = await ApplicationModel.findById(_id)
            if (!application) {
                return res.status(404).json("Application not found")
            }

            const normalizedDate = normalizeDate(date)
            if (!normalizedDate) {
                return res.status(400).json("Invalid date format")
            }

            const formattedDate = format(normalizedDate, 'dd.MM.yyyy', { locale: ru })
            application.dateAnswer = formattedDate
            application.history.push({ label: `Установлен срок ответа: до ${formattedDate}` })
            await application.save()

            await bot.telegram.sendMessage(id, `Заявка №${application.normalId} будет рассмотрена до ${formattedDate}.`,
                {
                    reply_markup: Markup.inlineKeyboard([
                        Markup.button.callback('Перейти к заявке', `?detailedApp_${application._id}`)
                    ]).resize().reply_markup
                }
            );

            res.status(200).send('Message sent successfully');
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).send('Failed to send message');
        }
    });
};

export const changeStatus = (app, bot) => {
    app.put("/api/application/change-status/:id", async (req, res) => {
        const { id } = req.params
        const { _id, status } = req.body;
        try {
            const application = await ApplicationModel.findById(_id)
            if (!application) {
                return res.status(404).json("Application not found")
            }
            application.status = status
            application.history.push({ label: `Статус изменен на: ${status}` })
            await application.save()

            await bot.telegram.sendMessage(id, `Статус заявки №${application.normalId} изменен на ${status}.`,
                {
                    reply_markup: Markup.inlineKeyboard([
                        Markup.button.callback('Перейти к заявке', `?detailedApp_${application._id}`)
                    ]).resize().reply_markup
                }
            );

            res.status(200).send('Message sent successfully');
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).send('Failed to send message');
        }
    });
};

export const closeApplication = (app, bot) => {
    app.put("/api/application/close-status/:id", async (req, res) => {
        const { id } = req.params
        const { _id, comments } = req.body;
        try {
            const application = await ApplicationModel.findById(_id)
            if (!application) {
                return res.status(404).json("Application not found")
            }
            application.status = "Отклонена"
            application.history.push({ label: `Заявка отклонена` })
            await application.save()
            const messageText = `Заявка №${application.normalId} отклонена.${comments ? ` Комментарий:\n${comments}` : ''}`;

            await bot.telegram.sendMessage(id, messageText,
                {
                    reply_markup: Markup.inlineKeyboard([
                        Markup.button.callback('Перейти к заявке', `?detailedApp_${application._id}`)
                    ]).resize().reply_markup
                }
            );

            res.status(200).send('Message sent successfully');
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).send('Failed to send message');
        }
    });
};


export const reviewedApplication = (app, bot) => {
    app.put("/api/application/reviewed/:id", upload.array('files'), async (req, res) => {
      const { id } = req.params
      const { _id, status, comments } = req.body;
      const files = req.files.map(file => file.filename);

      try {
        const updateData = { status, fileAnswer: files };
        if (comments) {
          updateData.comments = comments;
        }
  
        const application = await ApplicationModel.findByIdAndUpdate(
          _id,
          { $set: updateData },
          { new: true }
        );
  
        if (!application) {
          return res.status(404).json({ message: 'Application not found' });
        }
        application.status = "Рассмотрена"
        await application.save();
        const messageText = `Заявка №${application.normalId} ${status}!${status === 'Рассмотрена' ? '\nПерейдите на страницу заявки,\nчтобы увидеть ответ.' : ''}`;
        
        await bot.telegram.sendMessage(id, messageText,
          {
            reply_markup: Markup.inlineKeyboard([
              Markup.button.callback('Перейти к заявке', `?detailedApp_${application._id}`)
            ]).resize().reply_markup
          }
        );
  
        res.status(200).send('Message sent successfully');
      } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send('Failed to send message');
      }
    });
  };
  

export const getClarifications = (app, bot) => {
    app.post("/api/application/get-clarifications/:id", upload.array('files'), async (req, res) => {
        const { id } = req.params
        const { _id, text } = req.body
        const files = req.files || [];
        try {
            const application = await ApplicationModel.findById(_id)
            if (!application) {
                return res.status(404).json("Application not found")
            }

            const fileUrls = files.map(file => `https://yourdomain.com/${file.originalname}`)
            application.status = "На уточнении"
            application.history.push({ label: `Заявка передана на уточнение` })
            application.history.push({ label: `Статус заявки сменен на На уточнении` })

            let messageText = `По заявке №${application.normalId} требуются\nуточнения:\n---\n${text}`
            if (fileUrls.length > 0) {
                messageText += `\n\nФайлы уточнений:`
            }

            await application.save()

            await bot.telegram.sendMessage(id, messageText,
                {
                    reply_markup: Markup.inlineKeyboard(
                        fileUrls.map((fileUrl, index) =>
                            [Markup.button.url(`Файл ${index + 1}`, fileUrl)] 
                        ).concat(
                            [[Markup.button.callback('Отправить уточнение', `clarify_${application._id}`)]] 
                        )
                    ).resize().reply_markup
                }
            )

            res.status(200).send('Message sent successfully')
        } catch (e) {
            console.log("clarifications:", e)
            res.status(500).send('Error processing request')
        }
    })
}
