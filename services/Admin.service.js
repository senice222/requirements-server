import AdminModel from "../models/Admin.model.js";
import bcrypt, {genSalt, hash} from "bcrypt";
import jwt from "jsonwebtoken";

export const getAdmins = async (req, res) => {
    try {
        const access = req.access
        if (!access?.includes('Настройки')) {
            return res.status(403).json({message: "Недостаточно прав доступа"})
        }
        const admins = await AdminModel.find()

        return res.json(admins)
    } catch (e) {
        console.log(e)
        res.status(500).json({
            message: 'Не удалось создать продукт',
        });
    }
}

export const createAdmin = async (req, res) => {
    const {login, access, fio, comment, password} = req.body
    const access2 = req.access

    if (!access2?.includes('Настройки')) {
        return res.status(403).json({message: "Недостаточно прав доступа"})
    }
    
    try {
        const mbAdmin = await AdminModel.findOne({login})

        if (mbAdmin) {
            return res.status(500).json({message: "Такой логин уже зарегистрирован"})
        }
        const salt = await genSalt(10);
        const hashedPassword = await hash(password, salt);
        const doc = new AdminModel({
            login,
            access,
            fio,
            passwordHash: hashedPassword,
            comment,
        })

        const admin = await doc.save()
        const token = jwt.sign(
            {
                _id: admin._id
            },
            `JKzbagGASvas912<<<Zkjf`,
            {
                expiresIn: '15d'
            }
        )
        
        const admins = await AdminModel.find()

        return res.json(admins)
    } catch (e) {
        res.status(500).json({message: 'Ошибка создания админа'})
        console.log(e)
    }
}



export const login = async (req, res) => {
    const {login, password} = req.body
    try {
        const admin = await AdminModel.findOne({login,})

        if (!admin) {
            return res.status(404).json({
                message: 'Пользователь не найден'
            })
        }
        const isValidPass = await bcrypt.compare(password, admin.passwordHash)

        if (!isValidPass) {
            return res.status(404).json({
                message: 'Неверный логин или пароль'
            })
        }

        const token = jwt.sign(
            {
                _id: admin._id
            },
            `JKzbagGASvas912<<<Zkjf`,
            {
                expiresIn: '15d'
            }
        )

        res.status(200).json({token, admin})


    } catch (e) {
        console.log(e)
        res.status(500).json({
            message: 'Не удалось войти',
        });
    }
}

export const getMe = async (req, res) => {
    const user = await AdminModel.findById(req.userId)
    if (!user) {
        return res.status(404).json({
            message: 'Пользователь не найден',
        })
    }

    const {passwordHash, ...userData} = user._doc

    res.json(userData)
}
export const deleteAdmin = async (req, res) => {
    const {id} = req.params
    const access2 = req.access

    if (!access2?.includes('Настройки')) {
        return res.status(403).json({message: "Недостаточно прав доступа"})
    }
    const user = await AdminModel.findByIdAndDelete(id)
    if (!user) {
        return res.status(404).json({
            message: 'Пользователь не найден',
        })
    }


    const admins = await AdminModel.find()
    return res.json(admins)
}
export const changeAdmin = async (req, res) => {
    const {id} = req.params
    const {login, access, fio, comment, password} = req.body
    const access2 = req.access

    if (!access2?.includes('Настройки')) {
        return res.status(403).json({message: "Недостаточно прав доступа"})
    }
    const user = await AdminModel.findById(id)
    if (!user) {
        return res.status(404).json({
            message: 'Пользователь не найден',
        })
    }
    user.login = login
    user.access = access
    user.fio = fio
    user.comment = comment

    await user.save()

    const admins = await AdminModel.find()
    return res.json(admins)
}
export const changeUserPassword = async (req, res) => {
    const {oldPassword, newPassword} = req.body
    const {userId} = req

    try {
        const user = await AdminModel.findById(userId)

        if (!user) {
            return res.status(404).json({
                message: 'Пользователь не найден'
            })
        }
        console.log(oldPassword, user.passwordHash )
        const isValidPass = await bcrypt.compare(oldPassword, user.passwordHash)

        if (!isValidPass) {
            return res.status(404).json({
                message: 'Неверный пароль'
            })
        }


        const salt = await genSalt(10);
        const hashedPassword = await hash(newPassword, salt);
        user.passwordHash = hashedPassword

        await user.save()

        res.json({success : true})
    } catch (e) {
        console.log(e)
        res.status(500).json({
            message: 'Не удалось создать продукт',
        });
    }
}
