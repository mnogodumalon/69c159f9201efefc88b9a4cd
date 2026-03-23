// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export interface Eventplanung {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    event_name?: string;
    event_datum?: string; // Format: YYYY-MM-DD oder ISO String
    event_location_name?: string;
    event_strasse?: string;
    event_hausnummer?: string;
    event_plz?: string;
    event_stadt?: string;
    event_geo?: GeoLocation; // { lat, long, info }
    event_gaestezahl?: number;
    event_budget?: number;
    event_status?: LookupValue;
    event_beschreibung?: string;
  };
}

export interface Dienstleisterbuchungen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    buchung_event?: string; // applookup -> URL zu 'Eventplanung' Record
    buchung_dienstleister?: string; // applookup -> URL zu 'Dienstleisterverzeichnis' Record
    buchung_leistung?: string;
    buchung_preis?: number;
    buchung_status?: LookupValue;
    buchung_zahlungsstatus?: LookupValue;
    buchung_notizen?: string;
  };
}

export interface Dienstleisterverzeichnis {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    dl_firmenname?: string;
    dl_ansprechpartner_vorname?: string;
    dl_ansprechpartner_nachname?: string;
    dl_email?: string;
    dl_telefon?: string;
    dl_kategorie?: LookupValue;
    dl_website?: string;
    dl_notizen?: string;
  };
}

export interface Schnelleinladung {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    schnell_event?: string; // applookup -> URL zu 'Eventplanung' Record
    schnell_gast?: string; // applookup -> URL zu 'Gaesteverzeichnis' Record
    schnell_einladungsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    schnell_notiz?: string;
  };
}

export interface EinladungenRsvp {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    einladung_event?: string; // applookup -> URL zu 'Eventplanung' Record
    einladung_gast?: string; // applookup -> URL zu 'Gaesteverzeichnis' Record
    einladung_datum?: string; // Format: YYYY-MM-DD oder ISO String
    rsvp_status?: LookupValue;
    rsvp_datum?: string; // Format: YYYY-MM-DD oder ISO String
    einladung_notizen?: string;
  };
}

export interface Gaesteverzeichnis {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    email?: string;
    telefon?: string;
    firma?: string;
    position?: string;
    notizen_gast?: string;
  };
}

export const APP_IDS = {
  EVENTPLANUNG: '69c159d0fc8e176dbef4c8b9',
  DIENSTLEISTERBUCHUNGEN: '69c159d1b7a610218c085aed',
  DIENSTLEISTERVERZEICHNIS: '69c159cfc7199a62f1fbcf2b',
  SCHNELLEINLADUNG: '69c159d1d79da8a0453e5a8d',
  EINLADUNGEN_RSVP: '69c159d0d1bc3defc3599804',
  GAESTEVERZEICHNIS: '69c159c7934dbf179e30c8d8',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  eventplanung: {
    event_status: [{ key: "in_planung", label: "In Planung" }, { key: "einladungen_versendet", label: "Einladungen versendet" }, { key: "bestaetigt", label: "Bestätigt" }, { key: "abgeschlossen", label: "Abgeschlossen" }, { key: "abgesagt", label: "Abgesagt" }],
  },
  dienstleisterbuchungen: {
    buchung_status: [{ key: "angefragt", label: "Angefragt" }, { key: "angebot_erhalten", label: "Angebot erhalten" }, { key: "gebucht", label: "Gebucht" }, { key: "bestaetigt", label: "Bestätigt" }, { key: "storniert", label: "Storniert" }],
    buchung_zahlungsstatus: [{ key: "offen", label: "Offen" }, { key: "anzahlung", label: "Anzahlung geleistet" }, { key: "bezahlt", label: "Vollständig bezahlt" }],
  },
  dienstleisterverzeichnis: {
    dl_kategorie: [{ key: "catering", label: "Catering" }, { key: "technik", label: "Technik / AV" }, { key: "location", label: "Location" }, { key: "musik", label: "Musik / Entertainment" }, { key: "fotografie", label: "Fotografie / Video" }, { key: "dekoration", label: "Dekoration" }, { key: "transport", label: "Transport" }, { key: "sonstiges", label: "Sonstiges" }],
  },
  'einladungen_&_rsvp': {
    rsvp_status: [{ key: "ausstehend", label: "Ausstehend" }, { key: "zugesagt", label: "Zugesagt" }, { key: "abgesagt", label: "Abgesagt" }, { key: "vielleicht", label: "Vielleicht" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'eventplanung': {
    'event_name': 'string/text',
    'event_datum': 'date/datetimeminute',
    'event_location_name': 'string/text',
    'event_strasse': 'string/text',
    'event_hausnummer': 'string/text',
    'event_plz': 'string/text',
    'event_stadt': 'string/text',
    'event_geo': 'geo',
    'event_gaestezahl': 'number',
    'event_budget': 'number',
    'event_status': 'lookup/select',
    'event_beschreibung': 'string/textarea',
  },
  'dienstleisterbuchungen': {
    'buchung_event': 'applookup/select',
    'buchung_dienstleister': 'applookup/select',
    'buchung_leistung': 'string/textarea',
    'buchung_preis': 'number',
    'buchung_status': 'lookup/select',
    'buchung_zahlungsstatus': 'lookup/select',
    'buchung_notizen': 'string/textarea',
  },
  'dienstleisterverzeichnis': {
    'dl_firmenname': 'string/text',
    'dl_ansprechpartner_vorname': 'string/text',
    'dl_ansprechpartner_nachname': 'string/text',
    'dl_email': 'string/email',
    'dl_telefon': 'string/tel',
    'dl_kategorie': 'lookup/select',
    'dl_website': 'string/url',
    'dl_notizen': 'string/textarea',
  },
  'schnelleinladung': {
    'schnell_event': 'applookup/select',
    'schnell_gast': 'applookup/select',
    'schnell_einladungsdatum': 'date/date',
    'schnell_notiz': 'string/textarea',
  },
  'einladungen_&_rsvp': {
    'einladung_event': 'applookup/select',
    'einladung_gast': 'applookup/select',
    'einladung_datum': 'date/date',
    'rsvp_status': 'lookup/select',
    'rsvp_datum': 'date/date',
    'einladung_notizen': 'string/textarea',
  },
  'gaesteverzeichnis': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'email': 'string/email',
    'telefon': 'string/tel',
    'firma': 'string/text',
    'position': 'string/text',
    'notizen_gast': 'string/textarea',
  },
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateEventplanung = StripLookup<Eventplanung['fields']>;
export type CreateDienstleisterbuchungen = StripLookup<Dienstleisterbuchungen['fields']>;
export type CreateDienstleisterverzeichnis = StripLookup<Dienstleisterverzeichnis['fields']>;
export type CreateSchnelleinladung = StripLookup<Schnelleinladung['fields']>;
export type CreateEinladungenRsvp = StripLookup<EinladungenRsvp['fields']>;
export type CreateGaesteverzeichnis = StripLookup<Gaesteverzeichnis['fields']>;