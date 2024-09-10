import { Markup, Scenes } from "telegraf";
import { cancelKeyboard } from "./keyboard.js";
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';  
import UserModel from "../../models/User.model.js";
import ApplicationModel from "../../models/Application.model.js";
import { sendMail } from "../../utils/sendMail.js";
import axios from 'axios'
import dotenv from 'dotenv'
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadDirectory = path.join(__dirname, '../../api/uploads');

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
}
const fileInfoPath = path.join(__dirname, '../../utils/Предоставление_информации_по_требованию.doc');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDirectory);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = uuidv4();
        const fileName = `${path.parse(file.originalname).name}_${uniqueSuffix}${path.extname(file.originalname)}`;
        cb(null, fileName);
    }
});
const upload = multer({ storage: storage });

const ApplyExistingApplication = new Scenes.WizardScene(
    'apply_existing_application',
    async ctx => {
        ctx.wizard.state.deleteMessages = [];
        ctx.wizard.state.data = {};
        ctx.wizard.state.data.fileAct = [];
        ctx.wizard.state.data.fileExplain = [];

        const msg = await ctx.reply(`<b>⚙️ Отправьте файл требования</b>\n\n<i>Пожалуйста, отправляйте по одному файлу за раз. Вы можете отправить несколько файлов.</i>`, {
            reply_markup: cancelKeyboard.reply_markup,
            parse_mode: "HTML"
        });

        ctx.wizard.state.deleteMessages.push(msg.message_id);
        ctx.wizard.next();
    },
    async ctx => {
        if (ctx.updateType === 'callback_query') {
            if (ctx.update.callback_query.data === '?done_act') {
                const msg = await ctx.replyWithDocument({ source: fileInfoPath }, {
                    caption: '<b>❗ Скачайте и заполните приложенный выше опросный лист.\n\n⚙️ Отправьте заполненный опросный лист, а также дополнительные документы, если они есть. Список дополнительных документов указан в конце документа.</b>\n\n<i>Пожалуйста, отправляйте по одному файлу за раз. Вы можете отправить несколько файлов.</i>',
                    reply_markup: Markup.inlineKeyboard([
                        Markup.button.callback('❌ Отменить', '?cancelScene')
                    ]).resize().reply_markup,
                    parse_mode: 'HTML',
                });

                ctx.wizard.state.deleteMessages.push(msg.message_id);
                ctx.wizard.next();
            }
        } else if (ctx.message.document || ctx.message.photo) {
            try {
                const file = ctx.message.document || ctx.message.photo[ctx.message.photo.length - 1];
                const fileId = file.file_id;
                const fileInfo = await ctx.telegram.getFile(fileId);
                const filePath = fileInfo.file_path;
                const uniqueSuffix = uuidv4();
                const fileName = `${uniqueSuffix}_${path.basename(filePath)}`;
                const localFilePath = path.join(uploadDirectory, fileName);
                const fileStream = fs.createWriteStream(localFilePath);
                const fileUrl = `https://api.telegram.org/file/bot${process.env.TOKEN}/${filePath}`;

                const downloadStream = await axios({
                    url: fileUrl,
                    method: 'GET',
                    responseType: 'stream'
                });

                downloadStream.data.pipe(fileStream);

                const publicFileUrl = `https://orders.consultantnlgpanel.ru/api/uploads/${fileName}`;
                ctx.wizard.state.data.fileAct.push(publicFileUrl);

                if (ctx.wizard.state.data.fileAct.length === 1) {
                    const msg = await ctx.reply(
                        `Продолжайте отправлять файлы, если это необходимо. Как закончите, нажмите на кнопку “Готово” ниже.`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: 'Готово', callback_data: '?done_act' }]
                                ],
                            },
                            parse_mode: 'HTML',
                        }
                    );
                    ctx.wizard.state.deleteMessages.push(msg.message_id);
                }
            } catch (err) {
                console.error('Error during file download:', err);
                await ctx.reply('Произошла ошибка при сохранении файла. Попробуйте снова.');
            }
        } else if (ctx.message.text) {
            const msg = await ctx.reply('На этом этапе нельзя отправить текст. Пожалуйста, отправьте файл.');
            ctx.wizard.state.deleteMessages.push(msg.message_id);
        } else {
            await ctx.reply('Пожалуйста, отправьте файл.');
        }
    },
    async function (ctx) {
        if (ctx.updateType === 'callback_query') {
            if (ctx.update.callback_query.data === '?noExplanation') {
                try {
                    ctx.wizard.state.data.owner = ctx.from.id;
                    const user = await UserModel.findOne({ id: ctx.from.id });
                    const doc = await ApplicationModel.findById(ctx.wizard.state.applicationId);
                    const { fileAct, fileExplain } = ctx.wizard.state.data;

                    const application = new ApplicationModel({
                        owner: ctx.from.id,
                        name: doc.name,
                        inn: doc.inn,
                        fileAct,
                        fileExplain,
                    });

                    await application.save();
                    user.applications.push(application._id);
                    await user.save();

                    // Отправка письма
                    sendMail(application, `https://orders.consultantnlgpanel.ru/application/${application._id}`, 'new');

                    await ctx.reply(
                        `<b>✅ Заявка №${application.normalId} создана и отправлена на рассмотрение!</b>\n<i>В ближайшее время мы сообщим\nВам время рассмотрения заявки</i>`,
                        {
                            reply_markup: Markup.inlineKeyboard([
                                Markup.button.callback('Перейти к заявке', `?detailedApp_${application._id}`)
                            ]).resize().reply_markup,
                            parse_mode: 'HTML',
                        }
                    );

                    ctx.wizard.state.deleteMessages.forEach(item => ctx.deleteMessage(item));
                    ctx.scene.leave();
                } catch (err) {
                    console.error('Error during application creation:', err);
                    const msg = await ctx.reply('<b>Произошла ошибка при создании заявки. Попробуйте снова.</b>', { parse_mode: 'HTML' });
                    ctx.wizard.state.deleteMessages.push(msg.message_id);
                }
            }
        } else if (ctx.message.document || ctx.message.text) {
            try {
                let data;
                if (ctx.message.document) {
                    const file = ctx.message.document;
                    const fileInfo = await ctx.telegram.getFile(file.file_id);
                    const filePath = fileInfo.file_path;
                    const uniqueSuffix = uuidv4();
                    const fileName = `${uniqueSuffix}_${path.basename(filePath)}`;
                    const localFilePath = path.join(uploadDirectory, fileName);
                    const fileStream = fs.createWriteStream(localFilePath);
                    const downloadStream = await axios({
                        url: `https://api.telegram.org/file/bot${process.env.TOKEN}/${fileInfo.file_path}`,
                        method: 'GET',
                        responseType: 'stream'
                    });

                    downloadStream.data.pipe(fileStream);
                    const publicFileUrl = `https://orders.consultantnlgpanel.ru/api/uploads/${fileName}`;
                    data = publicFileUrl;
                } else if (ctx.message.photo) {
                    const photos = ctx.message.photo;
                    const highestResolutionPhoto = photos[photos.length - 1];
                    const fileInfo = await ctx.telegram.getFile(highestResolutionPhoto.file_id);
                    const uniqueSuffix = uuidv4();
                    const filePath = fileInfo.file_path;
                    const fileName = `${uniqueSuffix}_${path.basename(filePath)}`;
                    const localFilePath = path.join(uploadDirectory, fileName);
                    const fileStream = fs.createWriteStream(localFilePath);
                    const downloadStream = await axios({
                        url: `https://api.telegram.org/file/bot${process.env.TOKEN}/${fileInfo.file_path}`,
                        method: 'GET',
                        responseType: 'stream'
                    });

                    downloadStream.data.pipe(fileStream);
                    const publicFileUrl = `https://orders.consultantnlgpanel.ru/api/uploads/${fileName}`;
                    data = publicFileUrl;
                } else {
                    data = ctx.message.text;
                }

                ctx.wizard.state.data.fileExplain.push(data);

                if (ctx.wizard.state.data.fileExplain.length === 1) {
                    const msg = await ctx.reply(
                        `Продолжайте отправлять сообщения, если это необходимо.\nКак закончите, нажмите на кнопку “Готово” ниже.`,
                        {
                            reply_markup: Markup.inlineKeyboard([
                                [Markup.button.callback("Готово", "?noExplanation")]
                            ]).resize().reply_markup
                        }
                    );
                    ctx.wizard.state.deleteMessages.push(msg.message_id);
                }
            } catch (err) {
                console.error('Error during file download:', err);
                await ctx.reply('Произошла ошибка при сохранении файла. Попробуйте снова.');
            }
        } else {
            await ctx.reply('Пожалуйста, отправьте файл.');
        }
    }
);

ApplyExistingApplication.on('message', async (ctx, next) => {
    ctx.wizard.state.deleteMessages.push(ctx.message.message_id);
    next();
});

ApplyExistingApplication.action('?cancelScene', async ctx => {
    ctx.wizard.state.deleteMessages.forEach(item => ctx.deleteMessage(item));
    await ctx.scene.leave();
});

export default ApplyExistingApplication;
