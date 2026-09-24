import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, Divider } from '@mui/material';
import LucideIcon from './ui/LucideIcon';

const DRAWER_WIDTH = 260;

interface SidebarProps {
  mobileOpen: boolean;
  onDrawerToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onDrawerToggle }) => {
  const location = useLocation();

  const menuItems = [
    { text: 'Dashboard', icon: 'Layers', path: '/' },
    { text: 'JIRA Service', icon: 'Ticket', path: '/category/jira' },
    { text: 'GitHub Ops', icon: 'GitPullRequest', path: '/category/github' },
    { text: 'DevOps & CI/CD', icon: 'Cpu', path: '/category/devops' },
    { text: 'BOB CRM', icon: 'Store', path: '/category/crm' },
    { text: 'ITSM Portal', icon: 'ShieldAlert', path: '/category/itsm' },
    { text: 'Reports', icon: 'FileBarChart', path: '/category/reports' },
  ];

  const secondaryItems = [
    { text: 'Execution Logs', icon: 'Terminal', path: '/logs' },
    { text: 'Settings & API Keys', icon: 'Sliders', path: '/settings' },
    { text: 'Team Contacts', icon: 'Users', path: '/team-contacts' },
  ];

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', borderRight: '1px solid', borderColor: 'divider' }}>
      {/* Brand Header */}
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '8px',
            bgcolor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)',
          }}
        >
          <LucideIcon name="Terminal" size={18} className="text-white" />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 800, tracking: -0.5, background: 'linear-gradient(45deg, #3b82f6 30%, #10b981 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          DevPortal
        </Typography>
      </Box>

      <Divider />

      {/* Main Navigation */}
      <Box sx={{ flexGrow: 1, px: 2, py: 2 }}>
        <Typography variant="caption" sx={{ px: 2, fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
          Automations
        </Typography>
        <List sx={{ p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {menuItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  component={NavLink}
                  to={item.path}
                  sx={{
                    borderRadius: '8px',
                    bgcolor: active ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    borderLeft: active ? '3px solid' : '3px solid transparent',
                    borderLeftColor: 'primary.main',
                    color: active ? 'primary.main' : 'text.primary',
                    '&:hover': {
                      bgcolor: active ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'text.secondary' }}>
                    <LucideIcon name={item.icon} size={18} />
                  </ListItemIcon>
                  <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: active ? 600 : 500 }} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>

        <Typography variant="caption" sx={{ px: 2, fontWeight: 600, color: 'text.secondary', display: 'block', mt: 3, mb: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
          System
        </Typography>
        <List sx={{ p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {secondaryItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  component={NavLink}
                  to={item.path}
                  sx={{
                    borderRadius: '8px',
                    bgcolor: active ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    borderLeft: active ? '3px solid' : '3px solid transparent',
                    borderLeftColor: 'primary.main',
                    color: active ? 'primary.main' : 'text.primary',
                    '&:hover': {
                      bgcolor: active ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'text.secondary' }}>
                    <LucideIcon name={item.icon} size={18} />
                  </ListItemIcon>
                  <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: active ? 600 : 500 }} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      {/* Footer Info */}
      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ bgcolor: 'rgba(255,255,255,0.02)', p: 1.5, borderRadius: '8px', border: '1px dashed', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main', className: 'pulse-green' }} />
          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
            Simulated Engine Active
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
        }}
        open
      >
        {drawerContent}
      </Drawer>
    </Box>
  );
};

export default Sidebar;
