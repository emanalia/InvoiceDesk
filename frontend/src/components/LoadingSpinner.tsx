import React from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  className?: string;
  size?: number;
}

const LoadingSpinner: React.FC<Props> = ({ className = '', size = 24 }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <Loader2 className="animate-spin text-slate-400" size={size} />
  </div>
);

export default LoadingSpinner;
