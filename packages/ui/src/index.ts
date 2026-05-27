/**
 * @takuhon/ui — React mobile-first profile UI for takuhon.
 *
 * All components accept a single locale-resolved input shape from `@takuhon/core`
 * (`LocalizedTakuhon` or one of its sub-types) and render without state of their
 * own. CSS Modules co-located with each component are emitted into `dist/` as
 * plain files and must be imported by the consumer's bundler.
 */

export { TakuhonProfile, type TakuhonProfileProps } from './components/TakuhonProfile.js';
export { ProfileHeader, type ProfileHeaderProps } from './components/ProfileHeader.js';
export { LinksList, type LinksListProps } from './components/LinksList.js';
export { CareerTimeline, type CareerTimelineProps } from './components/CareerTimeline.js';
export { EducationTimeline, type EducationTimelineProps } from './components/EducationTimeline.js';
export { Certifications, type CertificationsProps } from './components/Certifications.js';
export { Memberships, type MembershipsProps } from './components/Memberships.js';
export { Volunteering, type VolunteeringProps } from './components/Volunteering.js';
export { HonorsList, type HonorsListProps } from './components/HonorsList.js';
export { Publications, type PublicationsProps } from './components/Publications.js';
export { Languages, type LanguagesProps } from './components/Languages.js';
export { Courses, type CoursesProps } from './components/Courses.js';
export { Patents, type PatentsProps } from './components/Patents.js';
export { ProjectsList, type ProjectsListProps } from './components/ProjectsList.js';
export { SkillsList, type SkillsListProps } from './components/SkillsList.js';
export { ContactInfo, type ContactInfoProps } from './components/ContactInfo.js';
export { Footer } from './components/Footer.js';
export { LocaleSwitcher, type LocaleSwitcherProps } from './components/LocaleSwitcher.js';
export { TakuhonHead, type TakuhonHeadProps } from './components/TakuhonHead.js';
