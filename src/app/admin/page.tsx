import AdminClient from "@/components/AdminClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VECXUS Admin — Panel de revisión",
};

export default function AdminPage() {
  return <AdminClient />;
}
