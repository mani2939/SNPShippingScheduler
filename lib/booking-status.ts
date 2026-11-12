export const bookingStatuses = {
  confirmed: "Confirmed",
  being_packed: "Being Packed",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;
export type BookingStatus = keyof typeof bookingStatuses;
export const activeBookingStatuses = ["confirmed", "being_packed", "shipped"];
export const activeBookingMessage = "You already have an active booking or urgent request. Please wait until it is completed, cancelled, or declined.";

export function canCustomerCancelBooking(booking: { status: string; dispatched_at: string | null }) {
  return booking.status === "confirmed" && booking.dispatched_at === null;
}

export type AdminBookingFilter = "all" | "confirmed" | "in_progress" | "completed" | "delayed";

export function matchesAdminBookingFilter(
  booking: { status: BookingStatus; dispatch_date: string; dispatched_at: string | null },
  filter: AdminBookingFilter,
  currentDate: string,
) {
  const delayed = booking.dispatch_date < currentDate &&
    (booking.status === "confirmed" || booking.status === "being_packed") &&
    booking.dispatched_at === null;

  if (filter === "all") return true;
  if (filter === "delayed") return delayed;
  if (filter === "confirmed") return booking.status === "confirmed" && !delayed;
  if (filter === "in_progress") {
    return (booking.status === "being_packed" || booking.status === "shipped") && !delayed;
  }
  return booking.status === "completed";
}
