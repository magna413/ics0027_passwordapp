// @typescript-eslint/no-unused-vars is disabled for NextAuth import because it's needed for module augmentation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
    }
  }

  interface User {
    id: string
    email: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
  }
}
