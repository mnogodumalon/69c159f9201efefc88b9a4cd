import type { Dienstleisterbuchungen, EinladungenRsvp, Schnelleinladung } from './app';

export type EnrichedEinladungenRsvp = EinladungenRsvp & {
  einladung_eventName: string;
  einladung_gastName: string;
};

export type EnrichedDienstleisterbuchungen = Dienstleisterbuchungen & {
  buchung_eventName: string;
  buchung_dienstleisterName: string;
};

export type EnrichedSchnelleinladung = Schnelleinladung & {
  schnell_eventName: string;
  schnell_gastName: string;
};
