import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  username: string;
  nickname: string;
  password?: string;
  email?: string;
  rating: number;
  gamesPlayed: number;
  gamesWon: number;
  tier: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    id: { type: String, unique: true },
    username: { type: String, required: true, unique: true, trim: true },
    nickname: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    rating: { type: Number, default: 1200 },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    tier: { type: String, default: 'BRONZE' },
  },
  { timestamps: true }
);

UserSchema.pre('save', function (next) {
  if (this.isNew || !this.id) {
    this.id = this._id.toString();
  }
  next();
});

// Prevent model overwrite in development
const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
