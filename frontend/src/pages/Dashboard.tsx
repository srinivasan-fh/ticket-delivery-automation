import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Grid, TextField, InputAdornment, Tabs, Tab, Divider, Chip } from '@mui/material';

import { useStore } from '../store/useStore';
import { SERVICES, CATEGORIES } from '../utils/servicesConfig';
import ServiceCard from '../components/ServiceCard';
import LucideIcon from '../components/ui/LucideIcon';

export const Dashboard: React.FC = () => {
  const { catId } = useParams<{ catId?: string }>();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(catId || 'all');
  const { favorites, recents } = useStore();

  useEffect(() => {
    if (catId) {
      setActiveCategory(catId);
    } else {
      setActiveCategory('all');
    }
  }, [catId]);


  // Filter services by search and active category tab
  const filteredServices = SERVICES.filter((service) => {
    const matchesSearch =
      service.title.toLowerCase().includes(search.toLowerCase()) ||
      service.description.toLowerCase().includes(search.toLowerCase());
    
    const matchesCategory = activeCategory === 'all' || service.category === activeCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Favorite services list
  const favoriteServices = SERVICES.filter((s) => favorites.includes(s.id));

  // Recently used services (sorted by time)
  const recentServices = recents
    .map((recent) => SERVICES.find((s) => s.id === recent.serviceId))
    .filter((s): s is typeof SERVICES[0] => !!s)
    .slice(0, 4); // Limit to top 4

  // Group services by category for structured sections
  const groupByCategory = (items: typeof SERVICES) => {
    return items.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, typeof SERVICES>);
  };

  const grouped = groupByCategory(filteredServices);

  const getCategoryTitle = (catId: string) => {
    return CATEGORIES.find((c) => c.id === catId)?.title || catId.toUpperCase();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Welcome Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, tracking: -0.5 }}>
            Developer Portal
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Central orchestrator for personal productivity, workflows, and cloud service automations.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip label="Jira Ready" color="success" size="small" variant="outlined" sx={{ py: 1.5 }} />
          <Chip label="GitHub Ready" color="success" size="small" variant="outlined" sx={{ py: 1.5 }} />
          <Chip label="DevOps Simulation" color="warning" size="small" variant="outlined" sx={{ py: 1.5 }} />
        </Box>
      </Box>

      {/* Search and Filters Bar */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'center' }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Filter integrations, actions, scripts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <LucideIcon name="Search" className="text-slate-400" />
              </InputAdornment>
            ),
          }}
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 2,
            maxWidth: { md: 500 }
          }}
        />

        <Tabs
          value={activeCategory}
          onChange={(_, val) => setActiveCategory(val)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 0,
            '& .MuiTabs-indicator': { height: 3, borderRadius: '3px' }
          }}
        >
          {CATEGORIES.map((cat) => (
            <Tab
              key={cat.id}
              label={cat.title}
              value={cat.id}
              icon={<LucideIcon name={cat.icon} size={16} />}
              iconPosition="start"
              sx={{ minHeight: 48, fontWeight: 600, fontSize: '0.85rem' }}
            />
          ))}
        </Tabs>
      </Box>

      {/* Row 1: Favorites & Recently Used */}
      {search === '' && activeCategory === 'all' && (
        <Grid container spacing={3}>
          {/* Favorites */}
          <Grid item xs={12} md={favorites.length > 0 ? 8 : 12}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <LucideIcon name="Star" fill="#f59e0b" className="text-amber-500" size={18} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Pinned Automations
              </Typography>
            </Box>
            
            {favoriteServices.length === 0 ? (
              <Box sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed', borderColor: 'divider', borderRadius: 3, textAlign: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">No automations pinned yet. Star a card below to pin it here!</Typography>
              </Box>
            ) : (
              <Grid container spacing={2.5}>
                {favoriteServices.map((service) => (
                  <Grid item xs={12} sm={6} key={`fav-${service.id}`}>
                    <ServiceCard service={service} />
                  </Grid>
                ))}
              </Grid>
            )}
          </Grid>

          {/* Recents */}
          {recents.length > 0 && (
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <LucideIcon name="History" size={18} className="text-slate-400" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Recently Executed
                </Typography>
              </Box>
              <Grid container spacing={2.5}>
                {recentServices.map((service) => (
                  <Grid item xs={12} key={`recent-${service.id}`}>
                    <ServiceCard service={service} />
                  </Grid>
                ))}
              </Grid>
            </Grid>
          )}
        </Grid>
      )}

      {/* Categorized Sections */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5, mt: 2 }}>
        {Object.entries(grouped).map(([category, items]) => (
          <Box key={category} id={`sec-${category}`}>
            <Box sx={{ display: 'flex', justifyItems: 'center', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '1.1rem' }}>
                {getCategoryTitle(category)}
              </Typography>
              <Chip
                label={`${items.length} Service${items.length > 1 ? 's' : ''}`}
                size="small"
                sx={{ fontWeight: 700, fontSize: '10px' }}
              />
            </Box>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={3}>
              {items.map((service) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={service.id}>
                  <ServiceCard service={service} />
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default Dashboard;
