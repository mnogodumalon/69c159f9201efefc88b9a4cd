import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import EventplanungPage from '@/pages/EventplanungPage';
import DienstleisterbuchungenPage from '@/pages/DienstleisterbuchungenPage';
import DienstleisterverzeichnisPage from '@/pages/DienstleisterverzeichnisPage';
import SchnelleinladungPage from '@/pages/SchnelleinladungPage';
import EinladungenRsvpPage from '@/pages/EinladungenRsvpPage';
import GaesteverzeichnisPage from '@/pages/GaesteverzeichnisPage';
import EventVorbereitenPage from '@/pages/intents/EventVorbereitenPage';
import RsvpVerwaltungPage from '@/pages/intents/RsvpVerwaltungPage';
import DienstleisterBuchenPage from '@/pages/intents/DienstleisterBuchenPage';

export default function App() {
  return (
    <HashRouter>
      <ActionsProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardOverview />} />
            <Route path="eventplanung" element={<EventplanungPage />} />
            <Route path="dienstleisterbuchungen" element={<DienstleisterbuchungenPage />} />
            <Route path="dienstleisterverzeichnis" element={<DienstleisterverzeichnisPage />} />
            <Route path="schnelleinladung" element={<SchnelleinladungPage />} />
            <Route path="einladungen-&-rsvp" element={<EinladungenRsvpPage />} />
            <Route path="gaesteverzeichnis" element={<GaesteverzeichnisPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="intents/event-vorbereiten" element={<EventVorbereitenPage />} />
            <Route path="intents/rsvp-verwaltung" element={<RsvpVerwaltungPage />} />
            <Route path="intents/dienstleister-buchen" element={<DienstleisterBuchenPage />} />
          </Route>
        </Routes>
      </ActionsProvider>
    </HashRouter>
  );
}
