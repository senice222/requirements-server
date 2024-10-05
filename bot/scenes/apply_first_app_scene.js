import { Markup, Scenes } from "telegraf"
import { extractFileName } from '../callbacks/applications/detailedApplication.js';
import { cancelKeyboard } from "./keyboard.js"
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid'; 
import { fileURLToPath } from 'url';
import UserModel from "../../models/User.model.js"
import ApplicationModel from "../../models/Application.model.js"
import { sendMail } from "../../utils/sendMail.js"
import dotenv from 'dotenv'
import multer from 'multer';
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

const ApplyApplication = new Scenes.WizardScene(
	'apply_first_application',
	async ctx => {
		ctx.wizard.state.deleteMessages = [];
		ctx.wizard.state.data = {};
		ctx.wizard.state.data.fileAct = [];
		ctx.wizard.state.data.fileExplain = [];
		ctx.wizard.state.data.additionalInformation = []

		const msg = await ctx.reply(
			`<b>⚙️ Введите полное название компании, от которой отправляется требование:</b> \n\n<i>Пример: ООО "Компания"</i>`,
			{
				reply_markup: cancelKeyboard.reply_markup,
				parse_mode: 'HTML',
			}
		);
		ctx.wizard.state.deleteMessages.push(msg.message_id);
		ctx.wizard.next();
	},
	async ctx => {
		if (ctx.updateType === 'message') {
			ctx.wizard.state.data['name'] = ctx.message.text;
			ctx.wizard.state.data['id'] = ctx.from.id
			const msg = await ctx.reply(
				`<b>⚙️ Введите ИНН компании, от которой отправляется требование:</b> \n\n<i>Пример: 7877675123</i>`,
				{
					reply_markup: cancelKeyboard.reply_markup,
					parse_mode: 'HTML',
				}
			);
			ctx.wizard.state.deleteMessages.push(msg.message_id);
			ctx.wizard.next();
		} else {
			await ctx.reply('Пожалуйста, введите название компании.');
		}

	},
	async ctx => {
		if (ctx.updateType === 'message') {
			ctx.wizard.state.data.accepted = true;
			ctx.wizard.state.data['inn'] = ctx.message.text;
			const msg = await ctx.reply(`<b>⚙️ Отправьте файл требования</b>\n\n<i>Пожалуйста, отправляйте по одному файлу за раз. Вы можете отправить несколько файлов.</i>`, {
				reply_markup: cancelKeyboard.reply_markup,
				parse_mode: "HTML"
			});

			ctx.wizard.state.deleteMessages.push(msg.message_id);
			ctx.wizard.next();
		}
	},
	async ctx => {
		if (ctx.updateType === 'callback_query') {
const callbackData = ctx.update.callback_query.data; 
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
		else if (callbackData.startsWith('?detailedApp_')) {
                // Действие для кнопки с ?detailedApp_
               	ctx.wizard.state.deleteMessages.forEach(item => ctx.deleteMessage(item))
		ctx.scene.leave()
                const applicationId = callbackData.split('_')[1]; // Получаем ID заявки из callback_data
                try {
                    const application = await ApplicationModel.findById(applicationId);
                    if (!application) {
                        await ctx.reply('Заявка не найдена.');
                        return;
                    }
        
                    // Формируем текст заявки
                    let messageText = `<b>Заявка №${application.normalId}</b>\n<b>Статус: </b>${application.status}`;
                    if (application.dateAnswer) {
                        messageText += `\nБудет рассмотрена до: ${application.dateAnswer}`;
                    }
                    if (application.status === "На уточнении") {
                        messageText += "\n–––––\n<i>Проверьте сообщение об уточнениях в этом чате выше и отправьте их.</i>\n–––––";
                    }
        
                    const validFiles = application.fileAnswer.filter(file => file.trim() !== '');
                    if (application.comments) {
                        messageText += `\n---\n<b>Ответ по заявке:</b>\n<b>Комментарии:</b> ${application.comments || 'Нет комментариев'}`;
                    }
        
                    if (validFiles.length > 0) {
                        validFiles.forEach((file) => {
                            const fileName = extractFileName(file);
                            const encodedFile = encodeURIComponent(file); // Кодируем файл для корректного URL
                            messageText += `\n<b>${fileName}</b>: <a href="https://orders.consultantnlgpanel.ru/api/uploads/${encodedFile}">Скачать</a>\n`;
                        });
                    }
        
                    messageText += `\n----\nПри возникновении вопросов по заявке обращайтесь на почту adm01@uk-fp.ru. В теме письма укажите “Вопрос по заявке №${application.normalId}”.`;
        
                    await ctx.editMessageText(
                        messageText,
                        {
                            reply_markup: Markup.inlineKeyboard([
                                [Markup.button.callback('Вернуться назад', `?myApplications`)]
                            ]).resize().reply_markup,
                            parse_mode: 'HTML'
                        }
                    );
        
                } catch (error) {
                    console.error('Error in detailedApplication:', error);
                    await ctx.reply('Произошла ошибка при загрузке заявки. Пожалуйста, попробуйте снова.');
                }
        
            } else if (callbackData === '?cancelScene') {
                // Действие для отмены сцены
                await ctx.reply('Вы отменили действие.');
                ctx.scene.leave();
            }
		} else if (ctx.message.document || ctx.message.photo) {
			try {
				const file = ctx.message.document || ctx.message.photo[ctx.message.photo.length - 1];
				const fileId = file.file_id;
				const fileInfo = await ctx.telegram.getFile(fileId);
				const filePath = fileInfo.file_path;
				
				const uniqueSuffix = uuidv4();
				const fileName = `${uniqueSuffix}@${path.basename(filePath)}`;
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
					const { name, inn, fileAct, fileExplain, additionalInformation } = ctx.wizard.state.data;

					const application = new ApplicationModel({
						owner: ctx.from.id,
						name,
						inn,
						fileAct,
						fileExplain,
						additionalInformation
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
                    const fileName = `${uniqueSuffix}@${path.basename(filePath)}`;
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
                    const fileName = `${uniqueSuffix}@${path.basename(filePath)}`;
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

)

ApplyApplication.on('message', async (ctx, next) => {
	ctx.wizard.state.deleteMessages.push(ctx.message.message_id)
	next()
})

ApplyApplication.action('?delete', async ctx => {
	ctx.deleteMessage(ctx.message.message_id)
})

ApplyApplication.action('?cancelScene', async ctx => {
	ctx.wizard.state.deleteMessages.forEach(item => ctx.deleteMessage(item))
	await ctx.scene.leave()
})

export default ApplyApplication
