import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import Dashboard from '../pages/Dashboard';
import ServiceRunner from '../pages/ServiceRunner';
import Logs from '../pages/Logs';
import Settings from '../pages/Settings';
import TeamContacts from '../pages/TeamContacts';
import OctopusProjects from '../pages/OctopusProjects';
import OctopusProjectDashboard from '../pages/OctopusProjectDashboard';
import GithubPullRequestReview from '../pages/GithubPullRequestReview';
import GithubCreateBranch from '../pages/GithubCreateBranch';
import GithubCreateTag from '../pages/GithubCreateTag';
import GithubCompareTags from '../pages/GithubCompareTags';
import ItsmTicketHub from '../pages/ItsmTicketHub';
import ReleaseTicketRepos from '../pages/ReleaseTicketRepos';
import ReleaseTicketForm from '../pages/ReleaseTicketForm';
import JenkinsJobs from '../pages/JenkinsJobs';
import TagSyncWatcher from '../pages/TagSyncWatcher';
import TagPromotionWatcher from '../pages/TagPromotionWatcher';
import MonthlyReport from '../pages/MonthlyReport';
import OpenPRDashboard from '../pages/OpenPRDashboard';
import { DEFAULT_OCTOPUS_PROJECT_ID } from '../utils/octopusFavorites';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<DashboardLayout />}>
        {/* Main Dashboard */}
        <Route index element={<Dashboard />} />
        
        {/* Category Specific View */}
        <Route path="category/:catId" element={<Dashboard />} />
        
        {/* Runner View for single service */}
        <Route path="service/:serviceId" element={<ServiceRunner />} />

        {/* Octopus Deploy lookalike views - /octopus lands straight on the most-used project */}
        <Route path="octopus" element={<Navigate to={`/octopus/${DEFAULT_OCTOPUS_PROJECT_ID}`} replace />} />
        <Route path="octopus/browse" element={<OctopusProjects />} />
        <Route path="octopus/:projectId" element={<OctopusProjectDashboard />} />

        {/* GitHub PR review */}
        <Route path="github/pr" element={<GithubPullRequestReview />} />

        {/* GitHub Create Branch */}
        <Route path="github/create-branch" element={<GithubCreateBranch />} />

        {/* GitHub Create Tag / Compare Tags */}
        <Route path="github/create-tag" element={<GithubCreateTag />} />
        <Route path="github/compare-tags" element={<GithubCompareTags />} />

        {/* GitHub Open PR Dashboard */}
        <Route path="github/open-pr" element={<OpenPRDashboard />} />

        {/* ITSM ticket hub */}
        <Route path="itsm/tickets" element={<ItsmTicketHub />} />

        {/* ITSM Release Ticket - repo picker, then a per-repo release-request form */}
        <Route path="itsm/release-ticket" element={<ReleaseTicketRepos />} />
        <Route path="itsm/release-ticket/:repo" element={<ReleaseTicketForm />} />

        {/* Jenkins jobs panel */}
        <Route path="devops/jenkins" element={<JenkinsJobs />} />

        {/* Tag Sync Watcher - poll Octopus for a SIT tag, auto-deploy once found */}
        <Route path="devops/tag-watcher" element={<TagSyncWatcher />} />

        {/* Tag Promotion Watcher - poll for a release tag, deploy to SIT-Beta, then Pre-Prod */}
        <Route path="devops/tag-promotion" element={<TagPromotionWatcher />} />

        {/* Monthly Report - completed/SIT/Production ticket counts for the current month */}
        <Route path="reports/monthly" element={<MonthlyReport />} />

        {/* History Audit Logs */}
        <Route path="logs" element={<Logs />} />
        
        {/* Credentials and General Config */}
        <Route path="settings" element={<Settings />} />
        <Route path="team-contacts" element={<TeamContacts />} />
        
        {/* Catch-all Redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
