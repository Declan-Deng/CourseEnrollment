import { contactRows } from "../portalContent";

export function ContactPage() {
  return (
    <div className="legacy-page legacy-page--contact">
      <table className="legacy-contact-table">
        <thead>
          <tr>
            <th>School / Departments</th>
            <th>Programmes</th>
            <th>Email Address</th>
          </tr>
        </thead>
        <tbody>
          {contactRows.map((group) =>
            group.programmes.map(([programme, email], index) => (
              <tr key={`${group.department}-${programme}`}>
                {index === 0 ? <td rowSpan={group.programmes.length}>{group.department}</td> : null}
                <td>{programme}</td>
                <td>
                  <a href={`mailto:${email}`}>{email}</a>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>

      <section className="legacy-maintenance">
        <h3>Information on System Maintenance</h3>
        <p>
          Please note that regular system maintenance is from 1:00pm - 2:00pm every Wednesday. The online enrolment
          system service may not be available during that period. Also, if there is any critical security update that
          are needed to be installed, the system may be taken down for patch installation without prior notice. Critical
          security update is usually required on the Wednesday after the second Tuesday of each month.
        </p>
      </section>
    </div>
  );
}
