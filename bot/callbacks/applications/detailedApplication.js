import { Markup } from 'telegraf'
import ApplicationModel from '../../../models/Application.model.js'

export function extractFileName(file) {
    const fileName = file.split('.')[0]; 
    
    return fileName;
}

const detailedApplication = (bot) => {
    bot.action([/\?detailedApp_(.+)/], async (ctx) => {
        const applicationId = ctx.match[1];
        try {
            const application = await ApplicationModel.findById(applicationId);
            if (!application) {
                await ctx.reply('Заявка не найдена.');
                return;
            }

            let messageText = `<b>Заявка №${application.normalId}</b>\n<b>Статус: </b>${application.status}`;
            if (application.dateAnswer) {
                messageText += `\nБудет рассмотрена до: ${application.dateAnswer}`;
            }
            if (application.status === "На уточнении") {
                messageText += "\n–––––\n<i>Проверьте сообщение об уточнениях в этом чате выше и отправьте их.</i>\n–––––"
            }
            const validFiles = application.fileAnswer.filter(file => file.trim() !== '');
            if (application.comments) (
                messageText += `\n---\n<b>Ответ по заявке:</b>\n<b>Комментарии:</b> ${application.comments || 'Нет комментариев'}`
            )
            if (validFiles.length > 0) {
                validFiles.forEach((file) => {
                    const fileName = extractFileName(file);
                    const encodedFile = encodeURIComponent(file); // Кодируем файл для корректного URL
                    messageText += `\n<b>${fileName}</b>: <a href="https://orders.consultantnlgpanel.ru/api/uploads/${encodedFile}">Скачать</a>\n`;
                });
                messageText += `\n----\nПри возникновении вопросов по заявке обращайтесь на почту adm01@uk-fp.ru. В теме письма укажите “Вопрос по заявке №${application.normalId}”.`
                await ctx.editMessageText(
                    messageText,
                    {
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.callback('Вернуться назад', `?myApplications`)]
                        ]).resize().reply_markup,
                        parse_mode: 'HTML'
                    }
                );
            } else {
                messageText += `\n----\nПри возникновении вопросов по заявке обращайтесь на почту adm01@uk-fp.ru. В теме письма укажите “Вопрос по заявке №${application.normalId}”.`
                await ctx.editMessageText(messageText,
                    {
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.callback('Вернуться назад', `?myApplications`)]
                        ]).resize().reply_markup,
                        parse_mode: 'HTML'
                    }
                );
            }
        } catch (error) {
            console.error('Error in detailedApplication:', error);
            await ctx.reply('Произошла ошибка при загрузке заявки. Пожалуйста, попробуйте снова.');
        }
    });
};




export default detailedApplication
