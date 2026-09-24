import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, IconButton, Badge, Box, Menu, MenuItem, Typography, Avatar, Tooltip, Divider, Button } from '@mui/material';
import { useStore } from '../store/useStore';
import LucideIcon from './ui/LucideIcon';
import { SERVICES } from '../utils/servicesConfig';


interface TopbarProps {
  onDrawerToggle: () => void;
  onOpenCommandPalette: () => void;
}

// Strips punctuation/casing so spoken transcripts line up with card titles for matching
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

const findMatchingService = (heardRaw: string) => {
  const heard = normalize(heardRaw);
  let best: typeof SERVICES[number] | null = null;
  let bestScore = 0;
  for (const s of SERVICES) {
    const title = normalize(s.title);
    const words = title.split(' ').filter(Boolean);
    let score: number;
    if (heard.includes(title) || title.includes(heard)) {
      score = 1 + title.length / 100; // substring match wins; tie-break toward the more specific title
    } else {
      const matched = words.filter((w) => heard.includes(w));
      score = words.length ? matched.length / words.length : 0;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 0.5 ? best : null;
};

export const Topbar: React.FC<TopbarProps> = ({ onDrawerToggle, onOpenCommandPalette }) => {
  const { themeMode, toggleTheme, notifications, clearNotifications, addNotification } = useStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const navigate = useNavigate();

  const handleOpenNotifications = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseNotifications = () => {
    setAnchorEl(null);
  };

  const handleVoiceCommand = () => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      addNotification('Voice Commands Unavailable', 'Your browser does not support voice recognition - try Chrome.', 'error');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string;
      const match = findMatchingService(transcript);
      if (match) {
        addNotification('Voice Command', `Opening "${match.title}"`, 'success');
        navigate(match.path);
      } else {
        addNotification('Voice Command', `Didn't recognize a service matching "${transcript}"`, 'error');
      }
    };

    recognition.start();
  };

  return (
    <AppBar
      position="sticky"
      sx={{
        bgcolor: 'background.default',
        color: 'text.primary',
        boxShadow: 'none',
        borderBottom: '1px solid',
        borderColor: 'divider',
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', gap: 2 }}>
        {/* Mobile menu trigger */}
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={onDrawerToggle}
          sx={{ mr: 2, display: { md: 'none' } }}
        >
          <LucideIcon name="Menu" />
        </IconButton>

        {/* Global Search Bar (Trigger command palette) */}
        <Box
          onClick={onOpenCommandPalette}
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: themeMode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px',
            px: 2,
            py: 0.75,
            width: { xs: '100%', sm: 350 },
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: themeMode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            }
          }}
        >
          <LucideIcon name="Search" size={16} className="text-slate-400" />
          <Typography variant="body2" sx={{ ml: 1.5, color: 'text.secondary', display: 'flex', justifyContent: 'space-between', flexGrow: 1, alignItems: 'center' }}>
            <span>Search automations...</span>
            <Box component="kbd" sx={{ px: 1, py: 0.2, fontSize: '10px', bgcolor: 'rgba(255,255,255,0.08)', border: '1px solid', borderColor: 'divider', borderRadius: '4px' }}>
              ⌘K
            </Box>
          </Typography>
        </Box>

        {/* Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Voice Command Trigger */}
          <Tooltip title={listening ? 'Listening... say a card name' : 'Voice command'}>
            <IconButton
              color={listening ? 'error' : 'inherit'}
              onClick={handleVoiceCommand}
              sx={listening ? { animation: 'pulse 1.2s infinite' } : undefined}
            >
              <LucideIcon name="Mic" size={20} />
            </IconButton>
          </Tooltip>

          {/* Notifications Indicator */}
          <IconButton color="inherit" onClick={handleOpenNotifications}>
            <Badge badgeContent={notifications.filter(n => n.type !== 'info').length} color="error">
              <LucideIcon name="Bell" size={20} />
            </Badge>
          </IconButton>

          {/* Theme Mode Toggle */}
          <IconButton color="inherit" onClick={toggleTheme}>
            <LucideIcon name={themeMode === 'dark' ? 'Sun' : 'Moon'} size={20} />
          </IconButton>

          <Divider orientation="vertical" variant="middle" flexItem sx={{ mx: 0.5 }} />

          {/* Profile Avatar */}
          <Tooltip title="Anboli (Administrator)">
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'primary.main',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              AN
            </Avatar>
          </Tooltip>
        </Box>

        {/* Notifications Popover */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleCloseNotifications}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            sx: {
              width: 340,
              maxHeight: 450,
              bgcolor: 'background.paper',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              border: '1px solid',
              borderColor: 'divider',
              mt: 1.5,
              p: 0,
            }
          }}
        >
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Recent Executions
            </Typography>
            {notifications.length > 0 && (
              <Button size="small" onClick={clearNotifications} sx={{ fontSize: '0.75rem' }}>
                Clear All
              </Button>
            )}
          </Box>
          <Divider />

          <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <Box sx={{ p: 4, textAlignment: 'center', color: 'text.secondary', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <LucideIcon name="Inbox" size={24} />
                <Typography variant="body2">No recent runs logged</Typography>
              </Box>
            ) : (
              notifications.map((item) => (
                <MenuItem
                  key={item.id}
                  onClick={handleCloseNotifications}
                  sx={{
                    py: 1.5,
                    px: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 0.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    whiteSpace: 'normal',
                    '&:last-child': { border: 0 }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: item.type === 'success' ? 'success.main' : item.type === 'error' ? 'error.main' : 'info.main'
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1, fontSize: '0.85rem' }}>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', pl: 2 }}>
                    {item.message}
                  </Typography>
                </MenuItem>
              ))
            )}
          </Box>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Topbar;
