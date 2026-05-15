import type { LocalizedMeport } from '@meport/core';

import '../styles/tokens.css';

import { CareerTimeline } from './CareerTimeline.js';
import { ContactInfo } from './ContactInfo.js';
import { Footer } from './Footer.js';
import { LinksList } from './LinksList.js';
import styles from './MeportProfile.module.css';
import { ProfileHeader } from './ProfileHeader.js';
import { ProjectsList } from './ProjectsList.js';
import { SkillsList } from './SkillsList.js';

export interface MeportProfileProps {
  data: LocalizedMeport;
}

export function MeportProfile({ data }: MeportProfileProps): React.JSX.Element {
  const showFooter = data.settings.showPoweredBy !== false;

  return (
    <article className={styles.root}>
      <ProfileHeader profile={data.profile} />
      <LinksList links={data.links} />
      <CareerTimeline careers={data.careers} />
      <ProjectsList projects={data.projects} />
      <SkillsList skills={data.skills} />
      <ContactInfo contact={data.contact} />
      {showFooter ? <Footer /> : null}
    </article>
  );
}
