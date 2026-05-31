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
import { Recommendations } from './Recommendations.js';
import { SkillsList } from './SkillsList.js';
import styles from './TakuhonProfile.module.css';
import { TestScores } from './TestScores.js';
import { Volunteering } from './Volunteering.js';

export interface TakuhonProfileProps {
  data: LocalizedTakuhon;
}

export function TakuhonProfile({ data }: TakuhonProfileProps): React.JSX.Element {
  const showFooter = data.settings.showPoweredBy !== false;
  const locale = data.resolvedLocale;

  return (
    <article className={styles.root}>
      <ProfileHeader profile={data.profile} />
      <LinksList links={data.links} locale={locale} />
      <EducationTimeline education={data.education} locale={locale} />
      <Courses courses={data.courses} locale={locale} />
      <CareerTimeline careers={data.careers} locale={locale} />
      <Memberships memberships={data.memberships} locale={locale} />
      <Certifications certifications={data.certifications} locale={locale} />
      <Patents patents={data.patents} locale={locale} />
      <ProjectsList projects={data.projects} locale={locale} />
      <Publications publications={data.publications} locale={locale} />
      <HonorsList honors={data.honors} locale={locale} />
      <Recommendations recommendations={data.recommendations} locale={locale} />
      <Volunteering volunteering={data.volunteering} locale={locale} />
      <SkillsList skills={data.skills} locale={locale} />
      <Languages languages={data.languages} locale={locale} />
      <TestScores testScores={data.testScores} locale={locale} />
      <ContactInfo contact={data.contact} locale={locale} />
      {showFooter ? <Footer /> : null}
    </article>
  );
}
