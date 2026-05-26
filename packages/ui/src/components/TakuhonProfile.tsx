import type { LocalizedTakuhon } from '@takuhon/core';

import '../styles/tokens.css';

import { CareerTimeline } from './CareerTimeline.js';
import { Certifications } from './Certifications.js';
import { ContactInfo } from './ContactInfo.js';
import { EducationTimeline } from './EducationTimeline.js';
import { Footer } from './Footer.js';
import { HonorsList } from './HonorsList.js';
import { Languages } from './Languages.js';
import { LinksList } from './LinksList.js';
import { ProfileHeader } from './ProfileHeader.js';
import { ProjectsList } from './ProjectsList.js';
import { SkillsList } from './SkillsList.js';
import styles from './TakuhonProfile.module.css';

export interface TakuhonProfileProps {
  data: LocalizedTakuhon;
}

export function TakuhonProfile({ data }: TakuhonProfileProps): React.JSX.Element {
  const showFooter = data.settings.showPoweredBy !== false;

  return (
    <article className={styles.root}>
      <ProfileHeader profile={data.profile} />
      <LinksList links={data.links} />
      <EducationTimeline education={data.education} />
      <CareerTimeline careers={data.careers} />
      <Certifications certifications={data.certifications} />
      <ProjectsList projects={data.projects} />
      <HonorsList honors={data.honors} />
      <SkillsList skills={data.skills} />
      <Languages languages={data.languages} />
      <ContactInfo contact={data.contact} />
      {showFooter ? <Footer /> : null}
    </article>
  );
}
