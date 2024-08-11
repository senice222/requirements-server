import { Markup } from "telegraf";

const startCommand = (bot) => {
    bot.command("start", async (ctx) => {

        return ctx.reply(`👋🏻 <b>Добро пожаловать, ${ctx.from.first_name}!</b> \nЗдесь вы можете подать заявку на консультацию по вопросам налоговой проверки.\nВыберите необходимый раздел:`, {
            reply_markup: Markup.inlineKeyboard([
                [
                    Markup.button.callback("Подать заявку", "?apply_application")
                ],
                [
                    Markup.button.callback("Мои заявки", "?myApplications")
                ]
            ]).resize().reply_markup,
            parse_mode: "HTML"
        });
    })
}

export default startCommand;