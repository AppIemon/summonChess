import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-key'
);

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { message: 'Username and password are required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return NextResponse.json(
        { message: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Check password
    const isPasswordMatch = await bcrypt.compare(password, user.password!);
    if (!isPasswordMatch) {
      return NextResponse.json(
        { message: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Create JWT
    const token = await new jose.SignJWT({
      userId: user._id.toString(),
      username: user.username
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    // Create response
    const response = NextResponse.json(
      {
        message: 'Login successful',
        user: user.toObject()
      },
      { status: 200 }
    );

    // Set cookie
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
