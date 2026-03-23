import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import DienstleisterbuchungenPage from '@/pages/DienstleisterbuchungenPage';
import GaesteverzeichnisPage from '@/pages/GaesteverzeichnisPage';
import SchnelleinladungPage from '@/pages/SchnelleinladungPage';
import EventplanungPage from '@/pages/EventplanungPage';
import DienstleisterverzeichnisPage from '@/pages/DienstleisterverzeichnisPage';
import EinladungenRsvpPage from '@/pages/EinladungenRsvpPage';
import GaestelIsteRsvpPage from '@/pages/intents/GaestelIsteRsvpPage';
import DienstleisterBuchenPage from '@/pages/intents/DienstleisterBuchenPage';
import BudgetUebersichtPage from '@/pages/intents/BudgetUebersichtPage';

export default function App() {
  return (
    <HashRouter>
      <ActionsProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardOverview />} />
            <Route path="dienstleisterbuchungen" element={<DienstleisterbuchungenPage />} />
            <Route path="gaesteverzeichnis" element={<GaesteverzeichnisPage />} />
            <Route path="schnelleinladung" element={<SchnelleinladungPage />} />
            <Route path="eventplanung" element={<EventplanungPage />} />
            <Route path="dienstleisterverzeichnis" element={<DienstleisterverzeichnisPage />} />
            <Route path="einladungen-&-rsvp" element={<EinladungenRsvpPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="intents/gaesteliste-rsvp" element={<GaestelIsteRsvpPage />} />
            <Route path="intents/dienstleister-buchen" element={<DienstleisterBuchenPage />} />
            <Route path="intents/budget-uebersicht" element={<BudgetUebersichtPage />} />
          </Route>
        </Routes>
      </ActionsProvider>
    </HashRouter>
  );
}
