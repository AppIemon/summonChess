import { NextResponse } from 'next/server';
import * as jose from 'jose';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-key'
);

export async function GET(request: Request) {
  try {
    const token = request.headers.get('cookie')
      ?.split(';')
      .find(c => c.trim().startsWith('auth_token='))
      ?.split('=')[1];

    if (!token) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    await connectDB();
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    return NextResponse.json({ user: user.toObject() }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
