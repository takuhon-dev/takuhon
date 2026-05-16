/**
 * @ownport/ui — React mobile-first profile UI for ownport.
 *
 * All components accept a single locale-resolved input shape from `@ownport/core`
 * (`LocalizedOwnport` or one of its sub-types) and render without state of their
 * own. CSS Modules co-located with each component are emitted into `dist/` as
 * plain files and must be imported by the consumer's bundler.
 */

export { OwnportProfile, type OwnportProfileProps } from './components/OwnportProfile.js';
export { ProfileHeader, type ProfileHeaderProps } from './components/ProfileHeader.js';
export { LinksList, type LinksListProps } from './components/LinksList.js';
export { CareerTimeline, type CareerTimelineProps } from './components/CareerTimeline.js';
export { ProjectsList, type ProjectsListProps } from './components/ProjectsList.js';
export { SkillsList, type SkillsListProps } from './components/SkillsList.js';
export { ContactInfo, type ContactInfoProps } from './components/ContactInfo.js';
export { Footer } from './components/Footer.js';
export { LocaleSwitcher, type LocaleSwitcherProps } from './components/LocaleSwitcher.js';
export { OwnportHead, type OwnportHeadProps } from './components/OwnportHead.js';
