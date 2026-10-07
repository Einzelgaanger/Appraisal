import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppraisalData } from '@/hooks/useAppraisalData';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { useNavigate } from 'react-router-dom';
import StatsCard from '@/components/dashboard/StatsCard';
import ManagerLeaderboard from '@/components/dashboard/ManagerLeaderboard';
import CompetencyRadar from '@/components/dashboard/CompetencyRadar';
import ScoreDistributionChart from '@/components/dashboard/ScoreDistributionChart';
import RelationshipPieChart from '@/components/dashboard/RelationshipPieChart';
import FeedbackThemes from '@/components/dashboard/FeedbackThemes';
import ManagerDetailPanel from '@/components/dashboard/ManagerDetailPanel';
import FilterPanel from '@/components/dashboard/FilterPanel';
import ExportButton from '@/components/dashboard/ExportButton';
import AIChatPanel from '@/components/dashboard/AIChatPanel';
import PlatformSidebar from '@/components/PlatformSidebar';
import AdminMobileTabBar from '@/components/AdminMobileTabBar';
import { ENABLE_APP_AI } from '@/lib/featureFlags';
import { Button } from '@/components/ui/button';
import { ManagerSummary } from '@/types/appraisal';
import { BarChart3, Users, Trophy, Target, Zap, ClipboardList } from 'lucide-react';
import { AdminDashboardSkeleton } from '@/components/shell/LoadingShells';

export default function Dashboard() {
  const { logout: legacyLogout } = useAuth();
  const { logout: employeeLogout } = useEmployeeAuth();
  const navigate = useNavigate();
  const {
    responses, managerSummaries, competencyScores, relationshipDistribution,
    scoreDistribution, feedbackThemes, overallStats, uniqueManagers,
    uniqueRelationships, loading, error, filters, setFilters
  } = useAppraisalData();

  const [selectedManager, setSelectedManager] = useState<ManagerSummary | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const dataContext = useMemo(() => {
    if (!managerSummaries.length) return '';
    
    // Build comprehensive context with ALL available data
    const allManagerData = managerSummaries.map(m => 
      `• ${m.manager_name}: Overall ${m.overall_score.toFixed(2)}/4.0, Team Leadership ${m.avg_team_leadership.toFixed(2)}, Results ${m.avg_results_orientation.toFixed(2)}, Culture ${m.avg_cultural_fit.toFixed(2)}, Reviews: ${m.total_responses}`
    ).join('\n');
    
    const relationshipData = Object.entries(relationshipDistribution)
      .map(([rel, count]) => `• ${rel}: ${count} reviews`)
      .join('\n');
    
    const scoreData = Object.entries(scoreDistribution)
      .map(([score, count]) => `• Score ${score}: ${count} occurrences`)
      .join('\n');
    
    const feedbackData = {
      stopDoing: feedbackThemes.stopDoing.slice(0, 15).map(f => `• ${f}`).join('\n'),
      startDoing: feedbackThemes.startDoing.slice(0, 15).map(f => `• ${f}`).join('\n'),
      continueDoing: feedbackThemes.continueDoing.slice(0, 15).map(f => `• ${f}`).join('\n'),
    };

    return `=== VGG 360° PERFORMANCE REVIEW DATA ===

SUMMARY STATISTICS:
• Total Responses: ${overallStats.totalResponses}
• Total Managers Evaluated: ${overallStats.totalManagers}
• Organization Average Score: ${overallStats.avgOverallScore}/4.0 (${((overallStats.avgOverallScore/4)*100).toFixed(0)}% performance)
• Top Performer: ${overallStats.topPerformer} with ${overallStats.topScore.toFixed(2)}/4.0

COMPETENCY BREAKDOWN (Organization-wide):
${competencyScores.map(c => `• ${c.name}: ${c.score.toFixed(2)}/4.0 (${((c.score/4)*100).toFixed(0)}%)`).join('\n')}

ALL MANAGERS - DETAILED SCORES:
${allManagerData}

REVIEWER RELATIONSHIP DISTRIBUTION:
${relationshipData}

SCORE FREQUENCY DISTRIBUTION:
${scoreData}

QUALITATIVE FEEDBACK - STOP DOING (Areas for Improvement):
${feedbackData.stopDoing || '• No feedback available'}

QUALITATIVE FEEDBACK - START DOING (Recommendations):
${feedbackData.startDoing || '• No feedback available'}

QUALITATIVE FEEDBACK - CONTINUE DOING (Strengths):
${feedbackData.continueDoing || '• No feedback available'}`;
  }, [managerSummaries, overallStats, competencyScores, relationshipDistribution, scoreDistribution, feedbackThemes]);

  const handleLogout = async () => { legacyLogout(); await employeeLogout(); navigate('/'); };

  if (loading) {
    return <AdminDashboardSkeleton />;
  }

  return (
    <div className="app-page">
      <div className="app-page-grid" />
      <PlatformSidebar
        title="Admin Dashboard"
        subtitle="Performance Intelligence"
        onLogout={handleLogout}
        items={[
          { key: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" />, active: true, onClick: () => {} },
          { key: 'appraisal', label: '360° Appraisal', icon: <ClipboardList className="w-4 h-4" />, to: '/appraisal' },
        ]}
        actions={
          ENABLE_APP_AI ? (
            <Button onClick={() => setChatOpen(true)} size="sm" className="h-8 w-full gap-2 rounded-xl font-sans text-[12.5px] font-medium normal-case tracking-normal">
              <Zap className="w-4 h-4" /> Analytics assistant
            </Button>
          ) : undefined
        }
      />

      <div className="app-sidebar-offset">
      <main className="platform-content section-stack has-admin-mobile-nav">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterPanel filters={filters} setFilters={setFilters} uniqueManagers={uniqueManagers} uniqueRelationships={uniqueRelationships} />
          <ExportButton managers={managerSummaries} responses={responses} />
        </div>
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatsCard title="Total Responses" value={overallStats.totalResponses} icon={Users} variant="default" delay={0} />
          <StatsCard title="Managers Evaluated" value={overallStats.totalManagers} icon={Target} variant="primary" delay={0.1} />
          <StatsCard title="Average Score" value={`${overallStats.avgOverallScore}/4.0`} subtitle={`${((overallStats.avgOverallScore/4)*100).toFixed(0)}% performance`} icon={BarChart3} variant="accent" delay={0.2} />
          <StatsCard title="Top Performer" value={overallStats.topPerformer} subtitle={`Score: ${overallStats.topScore.toFixed(2)}`} icon={Trophy} variant="success" delay={0.3} />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-1"><ManagerLeaderboard managers={managerSummaries} onSelectManager={setSelectedManager} selectedManager={selectedManager?.manager_name} /></div>
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-start">
              <CompetencyRadar competencies={competencyScores} />
              <ScoreDistributionChart distribution={scoreDistribution} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-start">
              <RelationshipPieChart distribution={relationshipDistribution} />
              <FeedbackThemes themes={feedbackThemes} />
            </div>
          </div>
        </div>
      </main>
      </div>

      <AnimatePresence>
        {selectedManager && <ManagerDetailPanel manager={selectedManager} onClose={() => setSelectedManager(null)} />}
      </AnimatePresence>
      {ENABLE_APP_AI && (
        <AIChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} dataContext={dataContext} />
      )}

      <AdminMobileTabBar
        onOpenCopilot={() => {
          if (ENABLE_APP_AI) setChatOpen(true);
        }}
        onSignOut={handleLogout}
      />
    </div>
  );
}
