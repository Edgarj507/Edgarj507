import { normalizePhone, smsGroupLink } from './sms';

it('normalizes US numbers to E.164', () => {
  expect(normalizePhone('(507) 555-0142')).toBe('+15075550142');
  expect(normalizePhone('1-507-555-0142')).toBe('+15075550142');
  expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  expect(normalizePhone('555-0142')).toBeNull();
});

it('builds platform group-text links', () => {
  const phones = ['507-555-0142', '(507) 555-0199', 'bad'];
  expect(smsGroupLink(phones, 'Hi & welcome', 'iPhone')).toBe('sms:/open?addresses=+15075550142,+15075550199&body=Hi%20%26%20welcome');
  expect(smsGroupLink(phones, 'Hi', 'Android')).toBe('sms:+15075550142,+15075550199?body=Hi');
});
