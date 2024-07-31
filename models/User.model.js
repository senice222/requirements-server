import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
    {
        id: {
            type: Number,
            required: true
        },
        username: {
            type: String,
            required: true
        },
        registered: {
            type: Date,
            required: true,
        },
        applications: {
            type: [],
            default: []
        }
    }
);

export default mongoose.model('User', UserSchema);