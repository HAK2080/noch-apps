// MarketingDashboard.jsx — entry for /marketing.
// Owner-only. Tabs: Channels · Customers · Cohorts.

import { useState } from 'react'
import { Megaphone, Users, BarChart3, Activity, Send, Calendar, Star, Image, TrendingUp, Trophy } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import ChannelAnalyticsTab from './tabs/ChannelAnalyticsTab'
import CustomersTab from './tabs/CustomersTab'
import CohortsTab from './tabs/CohortsTab'
import CampaignsTab from './tabs/CampaignsTab'
import ContentCalendarTab from './tabs/ContentCalendarTab'
import ReputationTab from './tabs/ReputationTab'
import UgcTab from './tabs/UgcTab'
import InsightsTab from './tabs/InsightsTab'
import ChallengesTab from './tabs/ChallengesTab'

const TABS = [
  { id: 'channels',   label: 'Channels',   icon: BarChart3 },
  { id: 'customers',  label: 'Customers',  icon: Users },
  { id: 'cohorts',    label: 'Cohorts',    icon: Activity },
  { id: 'insights',   label: 'Insights',   icon: TrendingUp },
  { id: 'campaigns',  label: 'Campaigns',  icon: Send },
  { id: 'challenges', label: 'Challenges', icon: Trophy },
  { id: 'fanwall',    label: 'Fan wall',   icon: Image },
  { id: 'calendar',   label: 'Calendar',   icon: Calendar },
  { id: 'reviews',    label: 'Reputation', icon: Star },
]

export default function MarketingDashboard() {
  const { isOwner } = useAuth()
  const [tab, setTab] = useState('channels')

  if (!isOwner) {
    return (
      <Layout>
        <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center max-w-xl mx-auto">
          <Megaphone size={40} className="mx-auto text-noch-muted mb-3 opacity-50"/>
          <p className="text-noch-muted text-sm">Marketing is owner-only.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Megaphone className="text-noch-green" size={24}/>
          <h1 className="text-2xl font-bold text-white">Marketing</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 border-b border-noch-border">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t.id ? 'border-noch-green text-noch-green' : 'border-transparent text-noch-muted hover:text-white'
              }`}>
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'channels'  && <ChannelAnalyticsTab />}
        {tab === 'customers' && <CustomersTab />}
        {tab === 'cohorts'   && <CohortsTab />}
        {tab === 'insights'   && <InsightsTab />}
        {tab === 'campaigns'  && <CampaignsTab />}
        {tab === 'challenges' && <ChallengesTab />}
        {tab === 'fanwall'    && <UgcTab />}
        {tab === 'calendar'  && <ContentCalendarTab />}
        {tab === 'reviews'   && <ReputationTab />}
      </div>
    </Layout>
  )
}
