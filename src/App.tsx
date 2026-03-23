import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import GaesteverzeichnisPage from '@/pages/GaesteverzeichnisPage';
import DienstleisterverzeichnisPage from '@/pages/DienstleisterverzeichnisPage';
import EventplanungPage from '@/pages/EventplanungPage';
import EinladungenRsvpPage from '@/pages/EinladungenRsvpPage';
import DienstleisterbuchungenPage from '@/pages/DienstleisterbuchungenPage';
import SchnelleinladungPage from '@/pages/SchnelleinladungPage';

export default function App() {
  return (
    <HashRouter>
      <ActionsProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardOverview />} />
            <Route path="gaesteverzeichnis" element={<GaesteverzeichnisPage />} />
            <Route path="dienstleisterverzeichnis" element={<DienstleisterverzeichnisPage />} />
            <Route path="eventplanung" element={<EventplanungPage />} />
            <Route path="einladungen-&-rsvp" element={<EinladungenRsvpPage />} />
            <Route path="dienstleisterbuchungen" element={<DienstleisterbuchungenPage />} />
            <Route path="schnelleinladung" element={<SchnelleinladungPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </ActionsProvider>
    </HashRouter>
  );
}
