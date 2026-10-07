import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import PlatformSidebar from '@/components/PlatformSidebar';
import { Trophy, Medal, Award, Star, Users } from 'lucide-react';
import { WallOfFamePageSkeleton } from '@/components/shell/LoadingShells';
import { fetchOrgPerformanceRankings } from '@/lib/boomDashboard360';

interface RankedEmployee {
  employee_id: string;
  name: string;
  subsidiary: string;
  avgScore: number;
  totalReviews: number;
}

export default function WallOfFame() {
  const { profile, logout } = useEmployeeAuth();
  const navigate = useNavigate();
  const [rankings, setRankings] = useState<RankedEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadRankings(); }, []);

  const loadRankings = async () => {
    try {
      const ranked = await fetchOrgPerformanceRankings();
      setRankings(ranked);
    } catch (err) {
      console.error('Rankings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  const getRankIcon = (rank: number) => {
    if (rank === 0) return <Trophy className="w-5 h-5 text-warning" />;
    if (rank === 1) return <Medal className="w-5 h-5 text-muted-foreground" />;
    if (rank === 2) return <Award className="w-5 h-5 text-primary" />;
    return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground">{rank + 1}</span>;
  };

  if (loading) {
    return <WallOfFamePageSkeleton />;
  }

  return (
    <div className="app-page">
      <div className="app-page-grid" />
      <PlatformSidebar
        title="Employee Portal"
        subtitle={profile?.name}
        onLogout={handleLogout}
        items={[
          { key: 'dashboard', label: 'My Dashboard', icon: <Star className="w-4 h-4" />, to: '/my-dashboard' },
          { key: 'rankings', label: 'Rankings', icon: <Trophy className="w-4 h-4" />, active: true, onClick: () => {} },
          { key: 'survey', label: 'Survey', icon: <Users className="w-4 h-4" />, to: '/survey' },
        ]}
      />

      <div className="app-sidebar-offset">
      <main className="platform-content section-stack">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-2xl font-bold font-serif mb-2">Performance Rankings</h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Combined leaderboard: legacy organisation-wide survey scores plus submitted BOOM quarterly peer 360 (Likert only,
            averaged per person). Executive EPA self-assessments are not included.
          </p>
        </motion.div>

        {/* Top 3 podium */}
        {rankings.length >= 3 && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[1, 0, 2].map((idx) => {
              const person = rankings[idx];
              const isFirst = idx === 0;
              return (
                <motion.div
                  key={person.employee_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + idx * 0.1 }}
                  className={`glass-panel p-5 text-center ${isFirst ? 'sm:-mt-4 border-primary/30 bg-primary/5' : ''}`}
                >
                  <div className="mb-3">{getRankIcon(idx)}</div>
                  <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${isFirst ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <span className="font-bold text-sm">{person.name.split(' ').map(n => n[0]).join('')}</span>
                  </div>
                  <p className="text-sm font-semibold truncate">{person.name}</p>
                  <p className="text-xs text-muted-foreground mb-2">{person.subsidiary}</p>
                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-3 h-3 text-primary" />
                    <span className="text-sm font-bold text-primary">{person.avgScore}</span>
                    <span className="text-xs text-muted-foreground">/5</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    <Users className="w-3 h-3 inline mr-0.5" />{person.totalReviews} reviews
                  </p>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Full list */}
        <div className="glass-panel divide-y divide-border">
          {rankings.map((person, i) => {
            const isMe = person.employee_id === profile?.employee_id;
            return (
              <motion.div
                key={person.employee_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * Math.min(i, 20) }}
                className={`flex items-center gap-4 px-5 py-3.5 ${isMe ? 'bg-primary/5' : ''}`}
              >
                <div className="w-8 flex-shrink-0 text-center">{getRankIcon(i)}</div>
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-muted-foreground">{person.name.split(' ').map(n => n[0]).join('')}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {person.name}
                    {isMe && <span className="ml-1.5 text-xs text-primary font-normal">(You)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{person.subsidiary}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-primary" />
                    <span className="text-sm font-bold">{person.avgScore}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{person.totalReviews} reviews</p>
                </div>
              </motion.div>
            );
          })}
          {rankings.length === 0 && (
            <div className="p-12 text-center">
              <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">No Rankings Yet</h2>
              <p className="text-muted-foreground text-sm">Rankings will appear once reviews are submitted.</p>
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
