import { HashRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ActionsProvider } from '@/context/ActionsContext';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import DienstleisterbuchungenPage from '@/pages/DienstleisterbuchungenPage';
import SchnelleinladungPage from '@/pages/SchnelleinladungPage';
import EventplanungPage from '@/pages/EventplanungPage';
import DienstleisterverzeichnisPage from '@/pages/DienstleisterverzeichnisPage';
import EinladungenRsvpPage from '@/pages/EinladungenRsvpPage';
import GaesteverzeichnisPage from '@/pages/GaesteverzeichnisPage';

const EventVorbereitenPage = lazy(() => import('@/pages/intents/EventVorbereitenPage'));
const EventAbschliessenPage = lazy(() => import('@/pages/intents/EventAbschliessenPage'));

export default function App() {
  return (
    <HashRouter>
      <ActionsProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardOverview />} />
            <Route path="dienstleisterbuchungen" element={<DienstleisterbuchungenPage />} />
            <Route path="schnelleinladung" element={<SchnelleinladungPage />} />
            <Route path="eventplanung" element={<EventplanungPage />} />
            <Route path="dienstleisterverzeichnis" element={<DienstleisterverzeichnisPage />} />
            <Route path="einladungen-rsvp" element={<EinladungenRsvpPage />} />
            <Route path="gaesteverzeichnis" element={<GaesteverzeichnisPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="intents/event-vorbereiten" element={<Suspense fallback={null}><EventVorbereitenPage /></Suspense>} />
            <Route path="intents/event-abschliessen" element={<Suspense fallback={null}><EventAbschliessenPage /></Suspense>} />
          </Route>
        </Routes>
      </ActionsProvider>
    </HashRouter>
  );
}
