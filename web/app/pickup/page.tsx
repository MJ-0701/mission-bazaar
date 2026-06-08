import { PickupBoard } from "@/components/PickupBoard";

export default async function PickupPage({
  searchParams
}: {
  searchParams: Promise<{ orderNo?: string; orderId?: string; token?: string }>;
}) {
  const params = await searchParams;
  return <PickupBoard orderNo={params.orderNo || params.orderId || ""} token={params.token || ""} />;
}
