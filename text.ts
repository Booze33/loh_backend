i got this error `ttisl@LAPTOP-KLQHH2DK MINGW64 ~/code/MICROVERSE/projects/node/loh/loh_backend (auth)
$ npm run dev

> loh_backend@1.0.0 dev
> tsx watch src/index.ts

file:///C:/Users/ttisl/code/MICROVERSE/projects/node/loh/loh_backend/src/middleware/auth.ts:1
var __defProp=Object.defineProperty;var __name=(target,value)=>__defProp(target,"name",{value,configurable:true});import jwt,{TokenExpiredError,JsonWebTokenError}from"jsonwebtoken";import{PrismaClient}from"@prisma/client";const prisma=new PrismaClient;const authMiddleware=__name(async(c,next)=>{try{const authHeader=c.req.header("Authorization");if(!authHeader||!authHeader.startsWith("Bearer ")){return c.json({error:"No or invalid authentication token format"},401)}const token=authHeader.split(" ")[1];if(!token){return c.json({error:"Authentication token is missing"},401)}const jwtSecret=process.env.JWT_SECRET;if(!jwtSecret){console.error("JWT_SECRET is not set in environment variables");return c.json({error:"Internal configuration error"},500)}let decoded;try{decoded=jwt.verify(token,jwtSecret)}catch(err){if(err instanceof TokenExpiredError){return c.json({error:"Authentication token has expired"},401)}if(err instanceof JsonWebTokenError){return c.json({error:"Invalid authentication token"},401)}throw err}const user=await prisma.user.findUnique({where:{id:decoded.userId},select:{id:true,name:true,email:true,role:true}});if(!user){return c.json({error:"User not found"},404)}c.set("user",user);await next()}catch(error){console.error("Error in auth middleware:",error);return c.json({error:"Internal server error",details:error instanceof Error?error.message:"Unknown error"},500)}},"authMiddleware");export{authMiddleware};
                                                                                                                                                ^^^^^^^^^^^^^^^^^
SyntaxError: The requested module 'jsonwebtoken' does not provide an export named 'JsonWebTokenError'
    at ModuleJob._instantiate (node:internal/modules/esm/module_job:131:21)
    at async ModuleJob.run (node:internal/modules/esm/module_job:213:5)
    at async ModuleLoader.import (node:internal/modules/esm/loader:316:24)
    at async loadESM (node:internal/process/esm_loader:34:7)
    at async handleMainPromise (node:internal/modules/run_main:66:12)

Node.js v20.9.0
` from this `import type { Context, Next, MiddlewareHandler } from 'hono';
import jwt, { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import type { DecodedToken } from '../types/auth/authTypes.ts';

const prisma = new PrismaClient();

export const authMiddleware: MiddlewareHandler = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'No or invalid authentication token format' }, 401);
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return c.json({ error: 'Authentication token is missing' }, 401);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not set in environment variables');
      return c.json({ error: 'Internal configuration error' }, 500);
    }

    let decoded: DecodedToken;

    try {
      decoded = jwt.verify(token, jwtSecret) as DecodedToken;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        return c.json({ error: 'Authentication token has expired' }, 401);
      }
      if (err instanceof JsonWebTokenError) {
        return c.json({ error: 'Invalid authentication token' }, 401);
      }
      throw err;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    c.set('user', user);
    await next();
  } catch (error) {
    console.error('Error in auth middleware:', error);
    return c.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
};
`