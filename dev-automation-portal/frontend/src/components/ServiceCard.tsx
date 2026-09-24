import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Typography, Box, IconButton, Button } from '@mui/material';
import { useStore } from '../store/useStore';
import LucideIcon from './ui/LucideIcon';

import { motion } from 'framer-motion';
import { ServiceItem } from '../types';

interface ServiceCardProps {
  service: ServiceItem;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service }) => {
  const navigate = useNavigate();
  const { favorites, toggleFavorite, recents, addRecent } = useStore();

  const isFavorite = favorites.includes(service.id);
  const recentInfo = recents.find((r) => r.serviceId === service.id);

  const getRecentText = () => {
    if (!recentInfo) return 'Not run recently';
    const seconds = Math.floor((Date.now() - new Date(recentInfo.timestamp).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(recentInfo.timestamp).toLocaleDateString();
  };

  const handleLaunch = () => {
    addRecent(service.id);
    navigate(service.path);
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className="glass-card"
        sx={{
          height: 200,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          borderRadius: 3,
        }}
      >
        <CardContent sx={{ p: 2.5, pb: '16px !important' }}>
          {/* Top Row: Icon and Favorite toggle */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                bgcolor: 'rgba(59, 130, 246, 0.08)',
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LucideIcon name={service.icon} size={20} />
            </Box>
            
            <IconButton
              size="small"
              onClick={() => toggleFavorite(service.id)}
              sx={{ color: isFavorite ? 'warning.main' : 'text.secondary' }}
            >
              <LucideIcon name="Star" fill={isFavorite ? '#f59e0b' : 'none'} size={18} />
            </IconButton>
          </Box>

          {/* Title & Description */}
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, fontSize: '1rem', lineHeight: 1.3 }}>
            {service.title}
          </Typography>
          
          <Typography variant="body2" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontSize: '0.825rem', height: 36 }}>
            {service.description}
          </Typography>
        </CardContent>

        {/* Footer actions */}
        <Box sx={{ p: 2, pt: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LucideIcon name="Clock" size={12} className="text-slate-400" />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.725rem' }}>
              {getRecentText()}
            </Typography>
          </Box>

          <Button
            size="small"
            variant="contained"
            onClick={handleLaunch}
            endIcon={<LucideIcon name="ChevronRight" size={14} />}
            sx={{
              py: 0.5,
              px: 1.5,
              fontSize: '0.75rem',
              fontWeight: 600,
              bgcolor: 'primary.main',
              color: 'white',
              '&:hover': {
                bgcolor: 'primary.dark'
              }
            }}
          >
            Launch
          </Button>
        </Box>
      </Card>
    </motion.div>
  );
};

export default ServiceCard;
