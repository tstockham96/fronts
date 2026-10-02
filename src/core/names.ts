import { hashStr } from './rng';

const SURNAMES = [
  'Okafor', 'Ines', 'Varga', 'Lindqvist', 'Moreau', 'Tanaka', 'Adeyemi', 'Kowalski', 'Haddad', 'Reyes',
  'Novak', 'Petrov', 'Castillo', 'Nakamura', 'Osei', 'Brennan', 'Silva', 'Duarte', 'Kaur', 'Mbeki',
  'Fischer', 'Rossi', 'Kim', 'Abara', 'Larsen', 'Quinn', 'Vasquez', 'Holt', 'Achebe', 'Sato',
  'Moretti', 'Okonkwo', 'Nguyen', 'Bauer', 'Ferreira', 'Dubois', 'Park', 'Jensen', 'Costa', 'Ibarra',
];
const CALLSIGNS = ['Fox', 'Raven', 'Badger', 'Viper', 'Falcon', 'Wolf', 'Otter', 'Lynx', 'Hawk', 'Bison', 'Cobra', 'Moose'];

export function rivalName(index: number, puzzle: number): string {
  return `Gen. ${SURNAMES[hashStr(`rival-${puzzle}-${index}`) % SURNAMES.length]}`;
}

export function randomCallsign(seed: number): string {
  return `General ${CALLSIGNS[seed % CALLSIGNS.length]}`;
}
