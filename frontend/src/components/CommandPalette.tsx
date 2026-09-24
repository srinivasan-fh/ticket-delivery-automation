import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Box, InputBase, List, ListItemButton, ListItemText, Typography, Chip } from '@mui/material';
import { SERVICES } from '../utils/servicesConfig';
import LucideIcon from './ui/LucideIcon';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);

  // Filter services based on query
  const filtered = SERVICES.filter(
    (service) =>
      service.title.toLowerCase().includes(query.toLowerCase()) ||
      service.description.toLowerCase().includes(query.toLowerCase()) ||
      service.category.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8); // Limit to top 8 results

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Key navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex].path);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, filtered]);

  const handleSelect = (path: string) => {
    navigate(path);
    setQuery('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
          boxShadow: '0 24px 50px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 3,
          overflow: 'hidden',
          top: '-15%', // Place it slightly higher up on the screen like Raycast
        }
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <LucideIcon name="Search" className="text-slate-400" />
        <InputBase
          autoFocus
          fullWidth
          placeholder="Type a command or automation service name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ fontSize: '1.05rem', color: 'text.primary' }}
        />
        <Chip label="ESC" size="small" variant="outlined" sx={{ fontSize: '10px', height: 20 }} />
      </Box>

      <Box ref={listRef} sx={{ maxHeight: 300, overflowY: 'auto', p: 1 }}>
        {filtered.length === 0 ? (
          <Box sx={{ p: 4, textAlignment: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">No services found matching "{query}"</Typography>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            {filtered.map((service, index) => {
              const active = index === selectedIndex;
              return (
                <ListItemButton
                  key={service.id}
                  selected={active}
                  onClick={() => handleSelect(service.path)}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    gap: 2,
                    py: 1.25,
                    bgcolor: active ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    '&:hover': {
                      bgcolor: 'rgba(255, 255, 255, 0.02)',
                    }
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '8px',
                      bgcolor: active ? 'primary.main' : 'rgba(255,255,255,0.04)',
                      color: active ? 'white' : 'text.secondary',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    <LucideIcon name={service.icon} size={18} />
                  </Box>
                  <ListItemText
                    primary={service.title}
                    secondary={service.description}
                    primaryTypographyProps={{ fontSize: '0.95rem', fontWeight: 600, color: 'text.primary' }}
                    secondaryTypographyProps={{ fontSize: '0.8rem', color: 'text.secondary', noWrap: true }}
                  />
                  <Chip
                    label={service.category.toUpperCase()}
                    size="small"
                    sx={{ fontSize: '9px', fontWeight: 600, height: 18 }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </Box>

      <Box sx={{ py: 1.5, px: 2, bgcolor: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'flex-end', gap: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <LucideIcon name="CornerDownLeft" size={10} /> Enter to select
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <LucideIcon name="ArrowUp" size={10} /><LucideIcon name="ArrowDown" size={10} /> Navigate
        </Typography>
      </Box>
    </Dialog>
  );
};

export default CommandPalette;
