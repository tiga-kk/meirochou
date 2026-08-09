export interface EventDayOption {
  readonly eventId: string;
  readonly eventLabel: string;
  readonly dayId: string;
  readonly dayLabel: string;
  readonly configured: boolean;
  readonly selected: boolean;
  readonly pendingCount: number;
}
