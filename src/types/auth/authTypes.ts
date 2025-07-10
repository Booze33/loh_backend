export interface UserData {
  name: string;
  email: string;
  password: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
}

export interface SignInUserData {
  email: string;
  password: string;
}

export interface PasswordData {
  email: string;
  password: string;
}

export interface DecodedToken {
  userId: string;
  iat: number;
  exp: number;
}