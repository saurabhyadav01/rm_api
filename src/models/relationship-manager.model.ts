export type RelationshipManager = {
  id: number;
  user_id: number | null;
  rm_id: string | null;
  franchisee_id: string | null;
  name: string;
  father_name: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  photo: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  wallet_balance: number | null;
  wallet_status: "active" | "inactive" | "suspended" | null;
  status: "active" | "inactive";
};
