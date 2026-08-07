import type { MapArea } from "../domain/map-area";
import type { CurrentLocationFormInput } from "./parse-current-location-form";

export interface CurrentLocationFormView {
  readCurrentLocation(): CurrentLocationFormInput | null;
  showCurrentLocationValidationError(message: string): void;
  updateMapAreaOptions(mapAreas: readonly MapArea[]): void;
  focusCurrentLocation(): void;
}

export class DomCurrentLocationFormView implements CurrentLocationFormView {
  constructor(
    private readonly areaSelect: HTMLSelectElement | null = null,
    private readonly labelInput: HTMLInputElement | null = null,
    private readonly numberInput: HTMLInputElement | null = null,
    private readonly errorElement: HTMLElement | null = null,
  ) {}

  readCurrentLocation(): CurrentLocationFormInput | null {
    const blockPrefix = this.areaSelect?.value ?? "";
    const spaceNumber = Number.parseInt(this.numberInput?.value ?? "", 10);
    if (!blockPrefix || !Number.isInteger(spaceNumber) || spaceNumber < 1)
      return null;
    return {
      blockPrefix: `${blockPrefix}${this.labelInput?.value ?? ""}`,
      spaceNumber,
    };
  }
  showCurrentLocationValidationError(message: string): void {
    this.errorElement?.replaceChildren(message);
  }
  updateMapAreaOptions(mapAreas: readonly MapArea[]): void {
    if (!this.areaSelect) return;
    this.areaSelect.replaceChildren(
      ...mapAreas.map(
        (area) => new Option(area.displayName ?? area.areaId, area.areaId),
      ),
    );
  }
  focusCurrentLocation(): void {
    this.areaSelect?.focus();
  }
}
