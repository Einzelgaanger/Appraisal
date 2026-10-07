import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useEmployeeAuth } from '@/contexts/EmployeeAuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import PlatformSidebar from '@/components/PlatformSidebar';
import {
  CheckCircle2, ChevronRight, ChevronLeft,
  Building2, User, ClipboardList, Send, Shield, BarChart3, Trophy
} from 'lucide-react';
import { PlatformHubSkeleton } from '@/components/shell/LoadingShells';
import { toast } from 'sonner';

interface Subsidiary { id: string; name: string; }
interface Employee { id: string; name: string; role: string | null; subsidiary_id: string; }
interface Category { id: string; name: string; sort_order: number; }
interface Question { id: string; category_id: string; question_text: string; question_type: string; sort_order: number; }

const SCALE_OPTIONS = [
  { value: 5, label: 'Most Likely' },
  { value: 4, label: 'Likely' },
  { value: 3, label: 'Neutral' },
  { value: 2, label: 'Unlikely' },
  { value: 1, label: 'Least Likely' },
];

export default function Survey() {
  const { user, profile, isAdmin, logout } = useEmployeeAuth();
  const submitInFlight = useRef(false);
  const navigate = useNavigate();
  const [step, setStep] = useState<'subsidiary' | 'employee' | 'questions' | 'submitted'>('subsidiary');
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedSubsidiary, setSelectedSubsidiary] = useState<Subsidiary | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [completedEmployees, setCompletedEmployees] = useState<Set<string>>(new Set());

  // Load completions from database
  useEffect(() => {
    if (user) {
      supabase
        .from('review_completions')
        .select('employee_id')
        .eq('reviewer_id', user.id)
        .then(({ data }) => {
          if (data) setCompletedEmployees(new Set(data.map(d => d.employee_id)));
        });
    }
  }, [user]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [subRes, catRes, qRes] = await Promise.all([
        supabase.from('subsidiaries').select('*').order('name'),
        supabase.from('survey_categories').select('*').order('sort_order'),
        supabase.from('survey_questions').select('*').order('sort_order'),
      ]);
      if (subRes.data) setSubsidiaries(subRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (qRes.data) setQuestions(qRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadEmployees = async (subsidiaryId: string) => {
    setEmployeesLoading(true);
    try {
      const { data } = await supabase.from('employees').select('*').eq('subsidiary_id', subsidiaryId).order('sort_order');
      if (data) setEmployees(data);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleSelectSubsidiary = (sub: Subsidiary) => {
    setSelectedSubsidiary(sub);
    setEmployees([]);
    setStep('employee');
    void loadEmployees(sub.id);
  };

  const handleSelectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setStep('questions');
    setCurrentCategoryIndex(0);
  };

  const currentCategory = categories[currentCategoryIndex];
  const currentQuestions = currentCategory ? questions.filter(q => q.category_id === currentCategory.id) : [];

  const isCurrentCategoryComplete = () => {
    if (!currentCategory) return false;
    return currentQuestions.every(q => q.question_type === 'open_ended' || answers[q.id] !== undefined);
  };

  const totalScoredQuestions = questions.filter(q => q.question_type === 'scored').length;
  const answeredScoredQuestions = questions.filter(q => q.question_type === 'scored' && answers[q.id] !== undefined).length;
  const progress = totalScoredQuestions > 0 ? (answeredScoredQuestions / totalScoredQuestions) * 100 : 0;

  const handleSubmit = async () => {
    if (!selectedEmployee || !selectedSubsidiary || !user || submitInFlight.current) return;
    submitInFlight.current = true;
    const emp = selectedEmployee;
    const sub = selectedSubsidiary;

    setCompletedEmployees(prev => {
      const next = new Set(prev);
      next.add(emp.id);
      return next;
    });
    setStep('submitted');
    toast.success('Response submitted successfully.');

    let responseId: string | null = null;
    try {
      const { data: responseData, error: responseError } = await supabase
        .from('survey_responses')
        .insert({ employee_id: emp.id, subsidiary_id: sub.id })
        .select('id')
        .single();
      if (responseError) throw responseError;
      responseId = responseData.id;

      const answerRows = Object.entries(answers).map(([questionId, value]) => ({
        response_id: responseData.id,
        question_id: questionId,
        score: typeof value === 'number' ? value : null,
        text_answer: typeof value === 'string' ? value : null,
      }));
      const { error: answersError } = await supabase.from('survey_answers').insert(answerRows);
      if (answersError) throw answersError;

      const { error: completionError } = await supabase.from('review_completions').insert({
        reviewer_id: user.id,
        employee_id: emp.id,
      });
      if (completionError) throw completionError;
    } catch (err) {
      console.error(err);
      if (responseId) {
        await supabase.from('survey_responses').delete().eq('id', responseId);
      }
      setCompletedEmployees(prev => {
        const next = new Set(prev);
        next.delete(emp.id);
        return next;
      });
      setStep('questions');
      toast.error('Failed to submit. Please try again.');
    } finally {
      submitInFlight.current = false;
    }
  };

  if (loading) {
    return <PlatformHubSkeleton />;
  }

  const stepNumber = step === 'subsidiary' ? 1 : step === 'employee' ? 2 : step === 'questions' ? 3 : 4;

  return (
    <div className="app-page">
      <div className="app-page-grid" />
      <PlatformSidebar
        title="Employee Portal"
        subtitle={profile?.name}
        onLogout={async () => { await logout(); navigate('/'); }}
        items={[
          { key: 'dashboard', label: 'My Dashboard', icon: <BarChart3 className="w-4 h-4" />, to: '/my-dashboard' },
          { key: 'rankings', label: 'Rankings', icon: <Trophy className="w-4 h-4" />, to: '/wall-of-fame' },
          { key: 'survey', label: 'Survey', icon: <ClipboardList className="w-4 h-4" />, active: true, onClick: () => {} },
          ...(isAdmin ? [{ key: 'admin', label: 'Admin', icon: <Shield className="w-4 h-4" />, to: '/appraisal' }] : []),
        ]}
      />

      <div className="app-sidebar-offset">
      {/* Step Indicator */}
      {step !== 'submitted' && (
        <div className="platform-canvas pt-6 pb-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {['Company', 'Person', 'Questions'].map((label, i) => (
              <div key={label} className="flex items-center gap-1.5 sm:gap-2 flex-1">
                <div className={`w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center transition-all duration-300 shadow-sm ${
                  i + 1 < stepNumber ? 'bg-primary text-primary-foreground shadow-primary/20'
                  : i + 1 === stepNumber ? 'bg-primary text-primary-foreground shadow-primary/20'
                  : 'bg-muted text-muted-foreground'
                }`}>
                  {i + 1 < stepNumber ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-xs hidden sm:block font-medium ${i + 1 <= stepNumber ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {label}
                </span>
                {i < 2 && <div className={`flex-1 h-0.5 rounded-full ${i + 1 < stepNumber ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress Bar (during questions) */}
      {step === 'questions' && categories.length > 0 && (
        <div className="platform-canvas pt-4 pb-1">
          <div className="flex justify-between text-[11px] text-muted-foreground mb-2 font-medium">
            <span>Section {currentCategoryIndex + 1} of {categories.length} — {currentCategory?.name}</span>
            <span className="text-primary font-bold">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      <div className="platform-content">
        <AnimatePresence mode="wait">
          {/* Step 1: Subsidiary */}
          {step === 'subsidiary' && (
            <motion.div key="subsidiary" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="glass-panel p-6 sm:p-8">
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold mb-1">Select Company</h2>
                  <p className="text-muted-foreground text-sm">Choose the subsidiary of the person you would like to review.</p>
                </div>
                <div className="grid gap-2.5">
                  {subsidiaries.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => handleSelectSubsidiary(sub)}
                      className="flex items-center justify-between p-4 rounded-2xl border-2 border-border bg-background hover:bg-muted/50 hover:border-primary/30 hover:shadow-md transition-all duration-200 text-left group"
                    >
                      <span className="font-semibold text-sm">{sub.name}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Employee */}
          {step === 'employee' && (
            <motion.div key="employee" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="glass-panel p-6 sm:p-8">
                <button onClick={() => setStep('subsidiary')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors font-medium">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                    <User className="w-6 h-6 text-accent" />
                  </div>
                  <h2 className="text-xl font-bold mb-1">Select Person to Review</h2>
                  <p className="text-muted-foreground text-sm">{selectedSubsidiary?.name}</p>
                </div>
                <div className="grid gap-2 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
                  {employeesLoading ? (
                    <div className="space-y-2 py-2">
                      <p className="text-xs text-muted-foreground">Loading people…</p>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-14 rounded-2xl bg-muted skeleton-pulse-fast" />
                      ))}
                    </div>
                  ) : (employees.map(emp => {
                    const isCompleted = completedEmployees.has(emp.id);
                    return (
                      <button
                        key={emp.id}
                        onClick={() => !isCompleted && handleSelectEmployee(emp)}
                        disabled={isCompleted}
                        className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-200 text-left group ${
                          isCompleted
                            ? 'border-primary/15 bg-primary/[0.03] cursor-not-allowed'
                            : 'border-border bg-background hover:bg-muted/50 hover:border-primary/30 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold ${
                            isCompleted ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                            {emp.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <span className={`font-semibold text-sm block ${isCompleted ? 'text-muted-foreground' : ''}`}>{emp.name}</span>
                            {emp.role && <span className="text-xs text-muted-foreground">{emp.role}</span>}
                          </div>
                        </div>
                        {isCompleted ? (
                          <div className="flex items-center gap-1.5 text-primary">
                            <span className="text-xs font-semibold">Reviewed</span>
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        )}
                      </button>
                    );
                  }))}
                </div>
              </div>
            </motion.div>
          )}

          {step === 'questions' && categories.length === 0 && (
            <motion.div key="questions-empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="glass-panel p-6 sm:p-8 max-w-lg mx-auto text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  The organisation-wide survey has no question bank loaded yet. Apply the latest database migrations (or ask an admin to seed legacy survey tables), then refresh.
                </p>
                <Button variant="outline" onClick={() => setStep('employee')} className="gap-1.5">
                  <ChevronLeft className="w-4 h-4" /> Back to person
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Questions */}
          {step === 'questions' && currentCategory && (
            <motion.div key={`cat-${currentCategoryIndex}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <div className="glass-panel p-6 sm:p-8">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-lg font-bold">{currentCategory.name}</h2>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-xl font-bold">
                    {currentCategoryIndex + 1} / {categories.length}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-6 ml-[52px]">
                  Reviewing: <span className="text-foreground font-semibold">{selectedEmployee?.name}</span>
                  {selectedEmployee?.role && <span className="text-muted-foreground"> — {selectedEmployee.role}</span>}
                </p>

                {/* Scale Legend */}
                {currentCategory.sort_order < 8 && (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 mb-8 p-4 rounded-2xl bg-muted/40 border border-border/60 text-xs text-muted-foreground">
                    {SCALE_OPTIONS.map(s => (
                      <span key={s.value} className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-center leading-6 font-bold text-xs">{s.value}</span>
                        <span className="font-medium">{s.label}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-8">
                  {currentQuestions.map((q, qi) => (
                    <motion.div 
                      key={q.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: qi * 0.05 }}
                      className="p-4 rounded-2xl bg-muted/20 border border-border/40"
                    >
                      <p className="text-sm leading-relaxed mb-4 font-medium">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold mr-2">{qi + 1}</span>
                        {q.question_text}
                      </p>
                      {q.question_type === 'scored' ? (
                        <div className="flex gap-2">
                          {SCALE_OPTIONS.map(s => (
                            <button
                              key={s.value}
                              onClick={() => setAnswers(prev => ({ ...prev, [q.id]: s.value }))}
                              className={`flex-1 py-3 rounded-xl border-2 text-center transition-all duration-200 ${
                                answers[q.id] === s.value
                                  ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20 -translate-y-0.5'
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:border-primary/30'
                              }`}
                            >
                              <div className="text-sm font-bold">{s.value}</div>
                              <div className="text-[10px] mt-0.5 hidden sm:block opacity-80 font-medium">{s.label}</div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Textarea
                          placeholder="Share your thoughts..."
                          value={(answers[q.id] as string) || ''}
                          onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          className="bg-background border-2 border-border rounded-xl min-h-[100px] text-sm resize-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-200"
                        />
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex justify-between mt-8 pt-6 border-t border-border/60">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (currentCategoryIndex === 0) setStep('employee');
                      else setCurrentCategoryIndex(prev => prev - 1);
                    }}
                    className="gap-1.5"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </Button>

                  {currentCategoryIndex < categories.length - 1 ? (
                    <Button
                      onClick={() => setCurrentCategoryIndex(prev => prev + 1)}
                      disabled={currentCategory.sort_order < 8 && !isCurrentCategoryComplete()}
                      className="gap-1.5"
                    >
                      Next Section <ChevronRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void handleSubmit()}
                      disabled={answeredScoredQuestions < totalScoredQuestions}
                      className="gap-1.5"
                    >
                      <Send className="w-4 h-4" />
                      Submit Response
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 4: Submitted */}
          {step === 'submitted' && (
            <motion.div key="submitted" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <div className="glass-panel p-10 sm:p-14 text-center max-w-md mx-auto">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.15 }}
                  className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle2 className="w-10 h-10 text-primary" />
                </motion.div>
                <h2 className="text-2xl font-bold mb-3">Thank You!</h2>
                <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                  Your anonymous feedback has been recorded successfully. Your responses will help drive meaningful improvement across the organisation.
                </p>
                <Button
                  size="lg"
                  onClick={() => {
                    setStep('subsidiary');
                    setSelectedSubsidiary(null);
                    setSelectedEmployee(null);
                    setAnswers({});
                    setCurrentCategoryIndex(0);
                  }}
                  className="gap-2"
                >
                  Review Another Person <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
}
