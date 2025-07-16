export const login = async (c: Context) => {
  try {
    const { email, password }: SignInUserData = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return c.json({ error: "Invalid credentials"}, 400);
    }

    // Add null check for password
    if (!user.password) {
      return c.json({ error: "Invalid credentials" }, 400);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return c.json({ error: "Invalid credentials password is wrong. Check authControllers" }, 400);
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '3h' }
    );

    return c.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    }, 200);
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ error: "Login failed. Please try again later." }, 500);
  }
}