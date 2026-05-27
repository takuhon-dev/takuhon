import type { LocalizedTakuhon } from '@takuhon/core';

import '../styles/tokens.css';

import { CareerTimeline } from './CareerTimeline.js';
import { Certifications } from './Certifications.js';
import { ContactInfo } from './ContactInfo.js';
import { Courses } from './Courses.js';
import { EducationTimeline } from './EducationTimeline.js';
import { Footer } from './Footer.js';
import { HonorsList } from './HonorsList.js';
import { Languages } from './Languages.js';
import { LinksList } from './LinksList.js';
import { Memberships } from './Memberships.js';
import { Patents } from './Patents.js';
import { ProfileHeader } from './ProfileHeader.js';
import { ProjectsList } from './ProjectsList.js';
import { Publications } from './Publications.js';
import { SkillsList } from './SkillsList.js';
import styles from './TakuhonProfile.module.css';
import { Volunteering } from './Volunteering.js';

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
      <Courses courses={data.courses} />
      <CareerTimeline careers={data.careers} />
      <Memberships memberships={data.memberships} />
      <Certifications certifications={data.certifications} />
      <Patents patents={data.patents} />
      <ProjectsList projects={data.projects} />
      <Publications publications={data.publications} />
      <HonorsList honors={data.honors} />
      <Volunteering volunteering={data.volunteering} />
      <SkillsList skills={data.skills} />
      <Languages languages={data.languages} />
      <ContactInfo contact={data.contact} />
      {showFooter ? <Footer /> : null}
    </article>
  );
}
