export function alarmToSchedule(
  existingAlarm: number | null,
  deadline: number,
): number | null {
  return existingAlarm === null ? deadline : null;
}
