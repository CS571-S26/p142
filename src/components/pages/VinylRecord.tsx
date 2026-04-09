interface VinylRecordProps {
    color: string;
    size?: number;
  }
  
  export function VinylRecord({ color, size = 200 }: VinylRecordProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer circle - vinyl */}
        <circle cx="100" cy="100" r="95" fill={color} />
        
        {/* Grooves */}
        <circle cx="100" cy="100" r="85" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="75" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="65" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="55" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="45" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
        
        {/* Label */}
        <circle cx="100" cy="100" r="35" fill="white" />
        
        {/* Center hole */}
        <circle cx="100" cy="100" r="8" fill={color} />
        
        {/* Label text rings */}
        <circle cx="100" cy="100" r="30" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
        <circle cx="100" cy="100" r="25" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
        <circle cx="100" cy="100" r="20" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
        <circle cx="100" cy="100" r="15" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
      </svg>
    );
  }
  