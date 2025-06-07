export interface Organization {
  name: string;
  description: string;
  image: string;
}

export interface Location {
  name: string;
  description: string;
  image: string;
  history: string;
  inhabitants: string;
  organizations: Organization[];
}

export interface Setting {
  name: string;
  description: string;
  genre: string;
  image: string;
  technology: string;
  magic: string;
  locations: Location[];
  isPublic: boolean;
}
