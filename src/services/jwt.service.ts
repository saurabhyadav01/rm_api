import jwt from "jsonwebtoken";
import { type RelationshipManager } from "../models/relationship-manager.model";

export type AuthTokenPayload = {
  sub: string; // rm id
  rm: {
    id: number;
    rm_id: string | null;
    user_id: number | null;
    franchisee_id: string | null;
    name: string;
    phone: string;
    email: string | null;
  };
};

export function signRmToken(rm: RelationshipManager): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing env JWT_SECRET");

  const payload: AuthTokenPayload = {
    sub: String(rm.id),
    rm: {
      id: rm.id,
      rm_id: rm.rm_id,
      user_id: rm.user_id,
      franchisee_id: rm.franchisee_id,
      name: rm.name,
      phone: rm.phone,
      email: rm.email,
    },
  };

  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

