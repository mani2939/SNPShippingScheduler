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
