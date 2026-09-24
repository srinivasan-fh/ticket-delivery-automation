import React from 'react';
import * as Icons from 'lucide-react';

interface LucideIconProps {
  name: string;
  className?: string;
  size?: number;
  fill?: string;
  style?: React.CSSProperties;
}

export const LucideIcon: React.FC<LucideIconProps> = ({ name, className = '', size = 20, fill, style }) => {
  // Fallback if the icon name is not found
  const IconComponent = (Icons as any)[name] || Icons.HelpCircle;
  return <IconComponent className={className} size={size} fill={fill} style={style} />;
};

export default LucideIcon;

