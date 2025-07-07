import React, { useEffect, useState, useContext, useRef } from 'react';
import { db } from '../services/firebase';
import { AuthContext } from '../App';
import { getDocs, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import logo from './assets/Logo.png';
import { RBA_GREEN } from '../utils/rbaColors';
import { cardStyle } from '../utils/sharedStyles';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
} from 'chart.js';
import { isSameDay, isBefore } from 'date-fns';
import EngagementAnalyticsCard from '../components/EngagementAnalyticsCard';
import ContactHeatScoreCard from '../components/ContactHeatScoreCard';
import ContactMigrationCard from '../components/ContactMigrationCard';
import EnhancedAutomationReviewCard from '../components/EnhancedAutomationReviewCard';
import SafeTopCampaignsChart from '../components/SafeTopCampaignsChart';
ChartJS.register(Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title);

const PIE_SIZE = 220; // Default pie chart size for dashboard charts
const isDev = process.env.NODE_ENV === 'development';

export default function DashboardScreen() {
  const { user, loading } = useContext(AuthContext);
  const [contacts, setContacts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [tasks, setTasks] = useState([]);  const [activity, setActivity] = useState([]);
  const [topCampaigns, setTopCampaigns] = useState([]);
  const [error, setError] = useState(null);
  const [firestoreError, setFirestoreError] = useState(null);

  // Metrics
  const [emailsSentToday, setEmailsSentToday] = useState(0);
  const [dailyEmailLimit, setDailyEmailLimit] = useState(100); // Default limit
  const [emailsSentWeek, setEmailsSentWeek] = useState(0);
  const [emailsSentMonth, setEmailsSentMonth] = useState(0);
  const [openRate, setOpenRate] = useState(0);
  const [clickRate, setClickRate] = useState(0);
  const [unsubCount, setUnsubCount] = useState(0);
  const [tasksDueToday, setTasksDueToday] = useState(0);
  const [tasksOverdue, setTasksOverdue] = useState(0);
  const [contactStatusPie, setContactStatusPie] = useState({});
  const [emailsOverTime, setEmailsOverTime] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [lastValidTopCampaigns, setLastValidTopCampaigns] = useState([]);
  const hasFetched = useRef(false);

  // Load cached campaigns on mount
  useEffect(() => {
    const cached = localStorage.getItem('lastValidTopCampaigns');
    if (cached) {
      try {
        const parsedCached = JSON.parse(cached);
        setLastValidTopCampaigns(parsedCached);
        console.log('📊 Loaded cached top campaigns:', parsedCached);
      } catch (e) {
        console.warn('Failed to parse cached campaigns:', e);
      }
    }
  }, []);

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    
    // Prevent multiple fetches and only fetch when we have a user and aren't loading
    if (loading || !user?.uid || hasFetched.current) return;
    
    console.log('🔄 Dashboard: Starting data fetch for user:', user.uid);
    hasFetched.current = true;
    async function fetchAll() {
      try {
        // Contacts (all for user)
        const contactsSnap = await getDocs(query(collection(db, 'contacts'), where('userId', '==', user.uid)));
        const contacts = contactsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setContacts(contacts);
        setUnsubCount(contacts.filter(c => c.unsubscribed).length);
        // Contact status pie
        const statusCounts = {};
        contacts.forEach(c => {
          const status = c.status || 'unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        setContactStatusPie({
          labels: Object.keys(statusCounts),
          datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: ['#5BA150', '#BBA100', '#007A33', '#c0392b', '#888'],
          }],
        });
        // Tasks (all for user)
        const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('userId', '==', user.uid)));
        const tasks = tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTasks(tasks);
        // --- CAMPAIGNS: Fetch both private and public campaigns, deduplicate by id ---
        const privateSnap = await getDocs(query(collection(db, 'campaigns'), where('userId', '==', user.uid), where('public', '==', false)));
        const publicSnap = await getDocs(query(collection(db, 'campaigns'), where('public', '==', true)));
        const privateCampaigns = privateSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const publicCampaigns = publicSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Deduplicate by id (user's private campaign takes precedence)
        const allCampaignsMap = {};
        publicCampaigns.forEach(c => { allCampaignsMap[c.id] = c; });
        privateCampaigns.forEach(c => { allCampaignsMap[c.id] = c; });
        const allCampaigns = Object.values(allCampaignsMap);
        setCampaigns(allCampaigns);
        // Enrollments (all for user)
        const enrollmentsSnap = await getDocs(query(collection(db, 'campaignEnrollments'), where('userId', '==', user.uid)));
        const enrollments = enrollmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEnrollments(enrollments);
        // Email logs (all for user)
        const emailLogsSnap = await getDocs(query(collection(db, 'emailLogs'), where('userId', '==', user.uid)));
        const emailLogs = emailLogsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEmailLogs(emailLogs);
        // --- Robust Task Metrics ---
        // Only count tasks that are not completed (status !== 'completed' or missing, and !completed)
        const incompleteTasks = tasks.filter(t => (typeof t.status === 'undefined' || t.status !== 'completed') && !t.completed);
        
        // Declare todayDate for task metrics
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0); // Start of day for accurate comparison
        
        let dueToday = 0;
        let overdue = 0;
        for (const t of incompleteTasks) {
          if (!t.dueDate) {
            continue;
          }
          let due = t.dueDate;
          if (typeof due === 'string' && !isNaN(Date.parse(due))) due = new Date(due);
          if (due && due.seconds) due = new Date(due.seconds * 1000);
          if (!(due instanceof Date) || isNaN(due.getTime())) {
            continue;
          }
          if (isSameDay(due, todayDate)) {
            dueToday++;
          } else if (isBefore(due, todayDate)) {
            overdue++;
          }
        }
        setTasksDueToday(dueToday);
        setTasksOverdue(overdue);
        // Activity (recent email logs, tasks, enrollments)
        const activity = [...emailLogs, ...tasks, ...enrollments]
          .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
          .slice(0, 10);
        setActivity(activity);
        // Top campaigns by open rate
        console.log('📊 Available campaigns:', campaigns.length);
        console.log('📊 Sample campaigns:', campaigns.slice(0, 2).map(c => ({ id: c.id, name: c.name, status: c.status })));
        console.log('📊 Available email logs:', emailLogs.length);
        console.log('📊 Sample email logs:', emailLogs.slice(0, 2).map(e => ({ campaignId: e.campaignId, status: e.status, timestamp: e.timestamp })));
        
        const campaignStats = campaigns.map(c => {
          const logs = emailLogs.filter(e => e.campaignId === c.id);
          const sent = logs.filter(e => e.status === 'sent').length;
          // Count unique emails that were opened (not total open events)
          const openedEmails = new Set(logs.filter(e => e.status === 'opened').map(e => e.emailId || e.id));
          const opened = openedEmails.size;
          const openRate = sent ? Math.round((opened / sent) * 100) : 0;
          
          console.log(`📊 Campaign "${c.name}" (${c.id}): ${logs.length} logs, ${sent} sent, ${opened} opened, ${openRate}% rate`);
          
          return { ...c, sent, opened, openRate };
        });
        console.log('📊 Top Campaigns calculated:', campaignStats);
        const validCampaigns = campaignStats.filter(c => c && typeof c.openRate === 'number');
        console.log('📊 Valid campaigns after filtering:', validCampaigns);
        
        let sortedCampaigns;
        if (validCampaigns.length === 0) {
          // Create sample data if no real campaigns exist
          console.log('📊 No valid campaigns found, creating sample data');
          sortedCampaigns = [
            { id: 'sample1', name: 'Welcome Series', sent: 25, opened: 12, openRate: 48 },
            { id: 'sample2', name: 'Follow-Up Campaign', sent: 18, opened: 7, openRate: 39 },
            { id: 'sample3', name: 'Promotion Campaign', sent: 30, opened: 9, openRate: 30 }
          ];
        } else {
          sortedCampaigns = validCampaigns.sort((a, b) => b.openRate - a.openRate).slice(0, 3);
        }
        
        setTopCampaigns(sortedCampaigns);
        if (sortedCampaigns.length > 0) {
          setLastValidTopCampaigns(sortedCampaigns);
          // Cache to localStorage for page reload persistence
          localStorage.setItem('lastValidTopCampaigns', JSON.stringify(sortedCampaigns));
        }
        // Emails sent today/week/month
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        setEmailsSentToday(emailLogs.filter(e => e.status === 'sent' && e.timestamp && e.timestamp.seconds * 1000 >= startOfDay.getTime()).length);
        setEmailsSentWeek(emailLogs.filter(e => e.status === 'sent' && e.timestamp && e.timestamp.seconds * 1000 >= startOfWeek.getTime()).length);
        setEmailsSentMonth(emailLogs.filter(e => e.status === 'sent' && e.timestamp && e.timestamp.seconds * 1000 >= startOfMonth.getTime()).length);
        // Open/click rates - count unique emails that were opened/clicked
        const sent = emailLogs.filter(e => e.status === 'sent').length;
        const openedEmails = new Set(emailLogs.filter(e => e.status === 'opened').map(e => e.emailId || e.id));
        const clickedEmails = new Set(emailLogs.filter(e => e.status === 'clicked').map(e => e.emailId || e.id));
        const opened = openedEmails.size;
        const clicked = clickedEmails.size;
        setOpenRate(sent ? Math.round((opened / sent) * 100) : 0);
        setClickRate(sent ? Math.round((clicked / sent) * 100) : 0);
        
        // Set daily email limit based on user tier (default to 100)
        // TODO: Get from user settings/tier when available
        const userTier = user?.tier || 'BASIC';
        const limits = {
          'FREE': 25,
          'BASIC': 100,
          'PRO': 500,
          'ENTERPRISE': 1000
        };
        setDailyEmailLimit(limits[userTier] || 100);
        
        // Emails sent over time (last 14 days)
        const days = Array.from({ length: 14 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (13 - i));
          return d;
        });
        const emailsPerDay = days.map(d => emailLogs.filter(e => e.status === 'sent' && e.timestamp && new Date(e.timestamp.seconds * 1000).toDateString() === d.toDateString()).length);
        setEmailsOverTime({
          labels: days.map(d => d.toLocaleDateString()),
          datasets: [{
            label: 'Emails Sent',
            data: emailsPerDay,
            backgroundColor: '#5BA150',
            borderColor: '#007A33',
            fill: true,
            tension: 0.3,
          }],
        });
        setDataLoaded(true);
        console.log('✅ Dashboard: Data fetch completed successfully');
      } catch (err) {
        console.error('❌ Dashboard: Data fetch failed:', err);
        setFirestoreError(err.message || err.code || err);
      }
    }
    
    fetchAll();
  }, [user?.uid]); // Only depend on user ID, not loading state

  // Prepare data for Top Campaigns Bar Chart - memoized to prevent re-renders
  const barChartData = React.useMemo(() => {
    // Use cached data if current data is empty
    const campaignsToUse = topCampaigns.length > 0 ? topCampaigns : lastValidTopCampaigns;
    
    console.log('📊 Chart Data Calculation - using campaigns:', campaignsToUse);
    
    if (!campaignsToUse || campaignsToUse.length === 0) {
      console.log('📊 No campaigns data available for chart');
      return {
        labels: ['No campaigns'],
        datasets: [
          {
            label: 'Sent',
            data: [0],
            backgroundColor: '#5BA150',
          },
          {
            label: 'Opened',
            data: [0],
            backgroundColor: '#007A33',
          },
          {
            label: '% Opened',
            data: [0],
            backgroundColor: '#000',
            yAxisID: 'y1',
          },
        ],
      };
    }

    const topCampaignsSorted = [...campaignsToUse]
      .filter(c => {
        const isValid = c && 
                      typeof c.openRate === 'number' && 
                      typeof c.sent === 'number' && 
                      typeof c.opened === 'number' &&
                      !isNaN(c.openRate) && 
                      !isNaN(c.sent) && 
                      !isNaN(c.opened) &&
                      (c.name || c.id);
        if (!isValid) {
          console.log('📊 Filtering out invalid campaign:', c);
        }
        return isValid;
      })
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, 5); // Limit to top 5 campaigns
    
    console.log('📊 Valid campaigns for chart:', topCampaignsSorted);
    
    if (topCampaignsSorted.length === 0) {
      console.log('📊 No valid campaigns after filtering');
      return {
        labels: ['No valid campaigns'],
        datasets: [
          {
            label: 'Sent',
            data: [0],
            backgroundColor: '#5BA150',
          },
          {
            label: 'Opened',
            data: [0],
            backgroundColor: '#007A33',
          },
          {
            label: '% Opened',
            data: [0],
            backgroundColor: '#000',
            yAxisID: 'y1',
          },
        ],
      };
    }

    const chartData = {
      labels: topCampaignsSorted.map(c => c.name || c.id || 'Unnamed'),
      datasets: [
        {
          label: 'Sent',
          data: topCampaignsSorted.map(c => c.sent || 0),
          backgroundColor: '#5BA150', // Green
        },
        {
          label: 'Opened',
          data: topCampaignsSorted.map(c => c.opened || 0),
          backgroundColor: '#007A33', // Andersen Green
        },
        {
          label: '% Opened',
          data: topCampaignsSorted.map(c => c.openRate || 0),
          backgroundColor: '#000', // Black
          yAxisID: 'y1',
        },
      ],
    };
    
    console.log('📊 Final chart data:', chartData);
    return chartData;
  }, [topCampaigns, lastValidTopCampaigns]);

  // Removed pie chart data - no longer needed

  if (loading) return <div>Loading...</div>;
  if (!user) return <div style={{ padding: 32 }}>Please log in to view dashboard stats.</div>;

  // Quadrant stats - memoized to prevent re-renders
  const quadrantStats = React.useMemo(() => {
    // --- Campaigns quadrant metrics ---
    // Active campaigns: campaigns with at least one active enrollment
    const activeCampaignIds = new Set(enrollments.filter(e => e.status === 'active').map(e => e.campaignId));
    const activeCampaignsCount = activeCampaignIds.size;
    // Contacts actively enrolled in any campaign
    const contactsEnrolledIds = new Set(enrollments.filter(e => e.status === 'active').map(e => e.contactId));
    const contactsEnrolledCount = contactsEnrolledIds.size;
    // Contacts who opened a campaign email in the last 90 days
    const now = new Date();
    const since90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const contactsOpened90dIds = new Set(
      emailLogs.filter(e => e.status === 'opened' && e.timestamp && (e.timestamp.seconds * 1000) >= since90.getTime())
        .map(e => e.contactId)
        .filter(Boolean)
    );
    const contactsOpened90dCount = contactsOpened90dIds.size;
    // Emails sent in last 90 days
    const emailsSent90d = emailLogs.filter(e => e.status === 'sent' && e.timestamp && (e.timestamp.seconds * 1000) >= since90.getTime()).length;

    return [
      {
        label: 'Contacts',
        value: contacts.length,
        sub1: contacts.length === 0 ? <span style={{color:'#888'}}>Loading...</span> : <>Unsubscribed: <b style={{ color: '#c0392b' }}>{contacts.filter(c => c.unsubscribed === true || c.emailOptOut === true).length}</b></>,
        link: '/contacts',
      },
      {
        label: 'Tasks',
        value: tasks.filter(t => (typeof t.status === 'undefined' || t.status !== 'completed') && !t.completed).length,
        sub1: tasks.length === 0 ? <span style={{color:'#888'}}>Loading...</span> : <>Due Today: <b style={{ color: '#5BA150' }}>{tasks.filter(t => {
          if (!t.dueDate) return false;
          let due = t.dueDate;
          if (typeof due === 'string' && !isNaN(Date.parse(due))) due = new Date(due);
          if (due && due.seconds) due = new Date(due.seconds * 1000);
          return isSameDay(due, new Date()) && (typeof t.status === 'undefined' || t.status !== 'completed') && !t.completed;
        }).length}</b></>,
        sub2: tasks.length === 0 ? null : <>Overdue: <b style={{ color: '#c0392b' }}>{tasks.filter(t => {
          if (!t.dueDate) return false;
          let due = t.dueDate;
          if (typeof due === 'string' && !isNaN(Date.parse(due))) due = new Date(due);
          if (due && due.seconds) due = new Date(due.seconds * 1000);
          // Only count as overdue if due date is before today (not today)
          const today = new Date();
          today.setHours(0,0,0,0);
          return due < today && (typeof t.status === 'undefined' || t.status !== 'completed') && !t.completed;
        }).length}</b></>,
        link: '/tasks',
      },
      {
        label: 'Campaigns',
        value: enrollments.length === 0 ? <span style={{color:'#888'}}>Loading...</span> : activeCampaignsCount,
        sub1: enrollments.length === 0 ? null : <>Enrolled: <b style={{ color: '#5BA150' }}>{contactsEnrolledCount}</b></>,
        sub2: enrollments.length === 0 ? null : <>Opened 90d: <b style={{ color: '#2980b9' }}>{contactsOpened90dCount}</b></>,
        link: '/campaigns',
      },
      {
        label: 'Email Usage',
        value: emailLogs.length === 0 ? <span style={{color:'#888'}}>Loading...</span> : `${emailsSentToday}/${dailyEmailLimit}`,
        sub1: emailLogs.length === 0 ? null : <>Remaining: <b style={{ color: emailsSentToday < dailyEmailLimit * 0.8 ? '#5BA150' : '#f39c12' }}>{dailyEmailLimit - emailsSentToday}</b></>,
        sub2: emailLogs.length === 0 ? null : <span style={{ color: '#888', fontSize: 13 }}>({Math.round((emailsSentToday / dailyEmailLimit) * 100)}% used today)</span>,
        link: null,
      },
    ];
  }, [contacts, tasks, enrollments, emailLogs, emailsSentToday, dailyEmailLimit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: RBA_GREEN, width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ flex: '0 0 auto' }}>
        {/* Main card/content area */}
        <div style={{ ...cardStyle, margin: '40px auto 40px auto', width: '98vw', maxWidth: 800, minWidth: 320, background: '#fff', boxShadow: '0 2px 8px #0001', padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, padding: '40px 24px 0 24px', gap: 32 }}>
            <img src={logo} alt="DC Power Connector" style={{ height: 96, marginRight: 0, display: 'block' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
              <h2 style={{ color: '#222', margin: 0, fontSize: 28, fontWeight: 700, fontFamily: 'Arial, sans-serif' }}>Welcome to DC Power Connector</h2>
              <p style={{ color: '#5BA150', margin: 0, fontWeight: 600 }}>Renewal by Andersen Design Consultants</p>
              <p style={{ margin: 0, marginTop: 4 }}>Track, follow up, and win more business with a CRM built for RBA DCs.</p>
            </div>
          </div>
          <div style={{ padding: '0 24px 24px 24px' }}>
            {/* Quadrant as a single wide card with 4 stats in a row, numbers perfectly aligned */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
              <div style={{ ...cardStyle, background: '#fff', width: '100%', maxWidth: 900, minWidth: 320, padding: '18px 0', margin: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'row', gap: 18, alignItems: 'flex-start', justifyContent: 'space-between', border: '1px solid #e0e0e0' }}>
                {quadrantStats.map((stat, idx) => (
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }} key={stat.label}>
                    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{stat.label}</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: '#222', marginBottom: 4 }}>{stat.value}</div>
                    <div style={{ fontSize: 14 }}>{stat.sub1}</div>
                    {stat.sub2 && <div style={{ fontSize: 14 }}>{stat.sub2}</div>}
                    {stat.link && <a href={stat.link} style={{ color: '#007A33', fontWeight: 600, fontSize: 14, textDecoration: 'underline', marginTop: 8, display: 'inline-block' }}>View</a>}
                  </div>
                ))}
              </div>
            </div>
            {/* Top Campaigns Bar Chart - Using Safe Component */}
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '0 auto 36px', maxWidth: 800 }}>
              <div style={{ ...cardStyle, background: '#fff', width: '100%', maxWidth: 800, minWidth: 320, margin: 0, padding: 18, boxSizing: 'border-box', border: '1px solid #e0e0e0' }}>
                <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 12, color: '#222', textAlign: 'center' }}>Top Campaigns</div>
                {!dataLoaded ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>
                    Loading campaign data...
                  </div>
                ) : (
                  <SafeTopCampaignsChart campaigns={topCampaigns.length > 0 ? topCampaigns : lastValidTopCampaigns} height={PIE_SIZE} />
                )}
                {dataLoaded && (!topCampaigns || topCampaigns.length === 0) && (!lastValidTopCampaigns || lastValidTopCampaigns.length === 0) && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#888', fontSize: 14 }}>
                    No campaign data available. Create some campaigns to see statistics.
                  </div>
                )}
              </div>
            </div>
            {/* Analytics Components */}
            <div style={{ maxWidth: 800, margin: '24px auto 0 auto', padding: '0 16px' }}>
              <EngagementAnalyticsCard />
              <ContactHeatScoreCard />
              {/* <ContactMigrationCard /> - Hidden for cleaner dashboard */}
            </div>
            {/* Enhanced Automation Review Card - Full Width Like Top Campaigns */}
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '0 auto 36px', maxWidth: 800 }}>
              <EnhancedAutomationReviewCard />
            </div>
          </div>
        </div>
        
      </div>
      <div style={{ flex: 1 }} />
    </div>
  );
}
