import Svg, { Circle, Path } from 'react-native-svg';

type IconProps = { color: string; size?: number };

export function HomeIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={1.5} />
      <Path
        d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5s-1.2 5.9-3.6 8.5c-2.4-2.6-3.6-5.4-3.6-8.5s1.2-5.9 3.6-8.5z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LabIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 4v16M12 4v16M19 4v16" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx="5" cy="15" r="2.2" fill="#000" stroke={color} strokeWidth={1.5} />
      <Circle cx="12" cy="8" r="2.2" fill="#000" stroke={color} strokeWidth={1.5} />
      <Circle cx="19" cy="13" r="2.2" fill="#000" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function FutureIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 18c4-1 7-3 9-6s5-6 9-7"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M3 18c5-.5 9-1.5 18-3" stroke={color} strokeWidth={1.5} strokeDasharray="2 3" />
      <Circle cx="3" cy="18" r="1.6" fill={color} />
    </Svg>
  );
}
