from flask import Flask, render_template, jsonify, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
import os
import re
from sqlalchemy import func, extract

app = Flask(__name__)
app.secret_key = 'dev-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///dvc_points.db'
db = SQLAlchemy(app)

class Contract(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    use_year_start = db.Column(db.Integer, nullable=False)  # 9 for September
    total_points = db.Column(db.Integer, nullable=False)    # 230 points

class Member(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    point_allocations = db.relationship('PointAllocation', backref='member', lazy=True)

class PointAllocation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    use_year = db.Column(db.Integer, nullable=False)  # 2024
    points = db.Column(db.Integer, nullable=False)
    is_banked = db.Column(db.Boolean, default=False)  # To track banked points

class StayMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stay_id = db.Column(db.Integer, db.ForeignKey('stay.id'), nullable=False)
    member_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    points_share = db.Column(db.Integer, nullable=False)  # Points allocated to this member
    member = db.relationship('Member', backref='stay_members', lazy=True)

class Stay(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    resort = db.Column(db.String(100), nullable=False)
    check_in = db.Column(db.Date, nullable=False)
    check_out = db.Column(db.Date, nullable=False)
    points_cost = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), nullable=False)  # 'planned' or 'booked'
    members = db.relationship('StayMember', backref='stay', lazy=True)
    stay_guests = db.relationship('StayGuest', backref='stay', lazy=True)
    additional_guests = db.relationship('AdditionalGuest',
                                     secondary='stay_additional_guest',
                                     backref=db.backref('stays', lazy=True))

class ActivityLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    action_type = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(500), nullable=False)
    member1_id = db.Column(db.Integer, db.ForeignKey('member.id'))
    member2_id = db.Column(db.Integer, db.ForeignKey('member.id'))
    stay_id = db.Column(db.Integer, db.ForeignKey('stay.id'))

    member1 = db.relationship('Member', foreign_keys=[member1_id])
    member2 = db.relationship('Member', foreign_keys=[member2_id])
    stay = db.relationship('Stay', foreign_keys=[stay_id])

class PointLoan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lender_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    borrower_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)
    use_year = db.Column(db.Integer, nullable=False)  # The year the points were borrowed from
    status = db.Column(db.String(20), nullable=False, default='active')  # active or repaid
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    lender = db.relationship('Member', foreign_keys=[lender_id])
    borrower = db.relationship('Member', foreign_keys=[borrower_id])

class PointBalance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    member1_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    member2_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    use_year = db.Column(db.Integer, nullable=False)
    points = db.Column(db.Integer, nullable=False)  # Positive means member1 owes member2, negative means member2 owes member1
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    member1 = db.relationship('Member', foreign_keys=[member1_id])
    member2 = db.relationship('Member', foreign_keys=[member2_id])

class AdditionalGuest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

# Association table for Stay and AdditionalGuest
stay_additional_guest = db.Table('stay_additional_guest',
    db.Column('stay_id', db.Integer, db.ForeignKey('stay.id'), primary_key=True),
    db.Column('guest_id', db.Integer, db.ForeignKey('additional_guest.id'), primary_key=True)
)

# Add these new routes:
@app.route('/api/stays', methods=['GET'])
def get_stays():
    stays = Stay.query.all()
    results = []
    for stay in stays:
        stay_members = []
        for stay_member in stay.members:
            member = Member.query.get(stay_member.member_id)
            stay_members.append({
                'name': member.name,
                'points_share': stay_member.points_share
            })

        results.append({
            'id': stay.id,
            'members': stay_members,
            'resort': stay.resort,
            'check_in': stay.check_in.strftime('%Y-%m-%d'),
            'check_out': stay.check_out.strftime('%Y-%m-%d'),
            'points_cost': stay.points_cost,
            'status': stay.status
        })
    return jsonify(results)

def validate_member_points(member_id, points_needed, is_banked=False):
    """Helper function to check if a member has enough points"""
    point_allocation = PointAllocation.query.filter_by(
        member_id=member_id,
        use_year=2024,
        is_banked=is_banked
    ).first()

    available_points = point_allocation.points if point_allocation else 0
    return available_points >= points_needed

@app.route('/api/stays', methods=['POST'])
def add_stay():
    try:
        data = request.get_json()

        stay = Stay(
            resort=data['resort'],
            check_in=datetime.strptime(data['check_in'], '%Y-%m-%d').date(),
            check_out=datetime.strptime(data['check_out'], '%Y-%m-%d').date(),
            points_cost=data['points_cost'],
            status=data['status']
        )
        db.session.add(stay)
        db.session.flush()  # Get the stay ID

        # Validate total points
        total_points = sum(
            share.get('points', share.get('total_points', 0))
            for share in data['shares']
        )
        if total_points != data['points_cost']:
            return jsonify({'error': 'Point shares must sum up to total points cost'}), 400

        # Process each share
        for share in data['shares']:
            if 'guest_id' in share:
                # Add guest to stay
                guest = AdditionalGuest.query.get(share['guest_id'])
                stay.additional_guests.append(guest)

                # Create stay members for each contributing member
                for member_id, points in share['member_points'].items():
                    stay_member = StayMember(
                        stay_id=stay.id,
                        member_id=int(member_id),
                        points_share=points
                    )
                    db.session.add(stay_member)
            else:
                # Regular member stay
                stay_member = StayMember(
                    stay_id=stay.id,
                    member_id=share['member_id'],
                    points_share=share['points']
                )
                db.session.add(stay_member)

        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/members')
def get_members():
    members = Member.query.all()
    return jsonify([{'id': m.id, 'name': m.name} for m in members])

@app.route('/')
def home():
    stays = Stay.query.order_by(Stay.check_in).all()
    members = Member.query.all()
    current_date = date.today()
    current_year = get_use_year(current_date)

    # Get point allocations for each member
    point_allocations = {}
    for member in members:
        point_allocations[member.id] = {
            current_year: {
                'regular': PointAllocation.query.filter_by(
                    member_id=member.id,
                    use_year=current_year,
                    is_banked=False
                ).first(),
                'banked': PointAllocation.query.filter_by(
                    member_id=member.id,
                    use_year=current_year,
                    is_banked=True
                ).first()
            }
        }

    # Calculate points used for each member
    points_used = {}
    for member in members:
        points_used[member.id] = calculate_points_used(member.id, current_year)

    additional_guests = AdditionalGuest.query.all()
    return render_template('index.html',
                         members=members,
                         stays=stays,
                         point_allocations=point_allocations,
                         points_used=points_used,
                         current_year=current_year,
                         now=current_date,
                         additional_guests=additional_guests)

def get_use_year(date):
    """Helper function to determine the use year for a given date.
    If the date is September 1st or later, it uses that year's points.
    If the date is before September 1st, it uses the previous year's points."""
    if date.month >= 9:  # September or later
        return date.year
    else:  # January through August
        return date.year - 1

@app.route('/api/stays/<int:stay_id>/status', methods=['POST'])
def update_stay_status(stay_id):
    try:
        stay = Stay.query.get_or_404(stay_id)
        new_status = request.form.get('status')

        if new_status not in ['planned', 'booked']:
            return jsonify({'error': 'Invalid status'}), 400

        # If marking as booked, deduct points from members
        if new_status == 'booked':
            # Determine which use year's points to deduct based on check-in date
            use_year = get_use_year(stay.check_in)

            for stay_member in stay.members:
                # Get the member's point allocation
                point_allocation = PointAllocation.query.filter_by(
                    member_id=stay_member.member_id,
                    use_year=use_year,
                    is_banked=False
                ).first()

                if not point_allocation or point_allocation.points < stay_member.points_share:
                    return jsonify({
                        'error': f'{stay_member.member.name} does not have enough {use_year} points. ' +
                                f'Needed: {stay_member.points_share}, ' +
                                f'Available: {point_allocation.points if point_allocation else 0}'
                    }), 400

                # Deduct the points
                point_allocation.points -= stay_member.points_share

        stay.status = new_status

        # Log the activity with all involved members
        member_descriptions = [f"{m.member.name} ({m.points_share} pts)" for m in stay.members]
        use_year_str = f" using {get_use_year(stay.check_in)} points" if new_status == 'booked' else ""
        log = ActivityLog(
            action_type='stay_booked' if new_status == 'booked' else 'stay_status_updated',
            description=f"Stay at {stay.resort} {new_status} for {', '.join(member_descriptions)}{use_year_str}",
            member1_id=stay.members[0].member_id if stay.members else None,
            member2_id=stay.members[1].member_id if len(stay.members) > 1 else None,
            stay_id=stay.id
        )
        db.session.add(log)

        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/stays/<int:stay_id>', methods=['PUT'])
def update_stay_api(stay_id):
    try:
        stay = Stay.query.get_or_404(stay_id)
        data = request.get_json()

        # Update basic stay information
        stay.resort = data['resort']
        stay.check_in = datetime.strptime(data['check_in'], '%Y-%m-%d')
        stay.check_out = datetime.strptime(data['check_out'], '%Y-%m-%d')
        stay.points_cost = data['points_cost']

        # Clear existing relationships
        StayMember.query.filter_by(stay_id=stay_id).delete()

        # First, get all existing StayGuests for this stay
        existing_stay_guests = StayGuest.query.filter_by(stay_id=stay_id).all()
        for sg in existing_stay_guests:
            # Delete associated GuestPoints first
            GuestPoints.query.filter_by(stay_guest_id=sg.id).delete()
        # Then delete the StayGuests
        StayGuest.query.filter_by(stay_id=stay_id).delete()

        # Update member point shares
        for member_data in data['members']:
            stay_member = StayMember(
                stay_id=stay_id,
                member_id=member_data['member_id'],
                points_share=member_data['points_share']
            )
            db.session.add(stay_member)

        # Update guest point shares
        for guest_data in data.get('guests', []):
            guest_id = guest_data['guest_id']

            # Create StayGuest entry
            stay_guest = StayGuest(
                stay_id=stay_id,
                guest_id=guest_id
            )
            db.session.add(stay_guest)
            db.session.flush()  # Get the stay_guest.id

            # Add guest points for each member
            for member_id, points in guest_data['member_points'].items():
                guest_points = GuestPoints(
                    stay_guest_id=stay_guest.id,
                    member_id=int(member_id),
                    points=points
                )
                db.session.add(guest_points)

            # Make sure guest is in additional_guests relationship
            guest = AdditionalGuest.query.get(guest_id)
            if guest not in stay.additional_guests:
                stay.additional_guests.append(guest)

        # Remove any guests that are no longer included
        current_guest_ids = {g['guest_id'] for g in data.get('guests', [])}
        for guest in stay.additional_guests[:]:  # Create a copy of the list to modify it
            if guest.id not in current_guest_ids:
                stay.additional_guests.remove(guest)

        db.session.commit()

        # Log the update
        log_entry = ActivityLog(
            action_type='update_stay',
            description=f'Updated stay at {stay.resort}',
            stay_id=stay_id,
            timestamp=datetime.now()
        )
        db.session.add(log_entry)
        db.session.commit()

        return jsonify({'message': 'Stay updated successfully'})

    except Exception as e:
        db.session.rollback()
        print(f"Error updating stay: {str(e)}")  # Add debugging output
        return jsonify({'error': str(e)}), 500

@app.route('/bank_points/<int:member_id>/<int:use_year>', methods=['GET', 'POST'])
def bank_points(member_id, use_year):
    if request.method == 'POST':
        try:
            points = int(request.form['points_to_bank'])
            member = Member.query.get_or_404(member_id)

            # Get regular points allocation
            regular_allocation = PointAllocation.query.filter_by(
                member_id=member_id,
                use_year=use_year,
                is_banked=False
            ).first()

            # Get or create banked points allocation
            banked_allocation = PointAllocation.query.filter_by(
                member_id=member_id,
                use_year=use_year,
                is_banked=True
            ).first()

            if not banked_allocation:
                banked_allocation = PointAllocation(
                    member_id=member_id,
                    use_year=use_year,
                    points=0,
                    is_banked=True
                )
                db.session.add(banked_allocation)

            if regular_allocation and points <= regular_allocation.points:
                # Deduct from regular points
                regular_allocation.points -= points
                # Add to banked points
                banked_allocation.points += points

                # Log the activity
                log_entry = ActivityLog(
                    action_type='points_banked',
                    description=f'{member.name} banked {points} points from {use_year}',
                    member1_id=member_id,
                    timestamp=datetime.now()
                )
                db.session.add(log_entry)
                db.session.commit()

                flash(f'Successfully banked {points} points', 'success')
            else:
                flash('Invalid points amount', 'error')

            return redirect(url_for('home'))

        except Exception as e:
            db.session.rollback()
            flash(f'Error banking points: {str(e)}', 'error')
            return redirect(url_for('home'))

    # GET request shows the banking form
    member = Member.query.get_or_404(member_id)
    return render_template(
        'bank_points.html',
        member=member,
        use_year=use_year
    )

@app.route('/activity')
def activity_log():
    activity_type = request.args.get('type', 'all')
    member_id = request.args.get('member_id', 'all')

    # Get all unique activity types for the filter dropdown
    activity_types = db.session.query(ActivityLog.action_type).distinct().all()
    activity_types = [t[0] for t in activity_types]

    # Get all members for the filter dropdown
    members = Member.query.all()

    # Build the query
    query = ActivityLog.query

    # Filter by activity type if specified
    if activity_type and activity_type != 'all':
        query = query.filter_by(action_type=activity_type)

    # Filter by member if specified
    if member_id and member_id != 'all':
        member_id = int(member_id)
        query = query.filter(
            db.or_(
                ActivityLog.member1_id == member_id,
                ActivityLog.member2_id == member_id
            )
        )

    # Get the filtered logs
    logs = query.order_by(ActivityLog.timestamp.desc()).all()

    return render_template('activity.html',
                         logs=logs,
                         activity_types=activity_types,
                         members=members,
                         selected_type=activity_type,
                         selected_member=member_id)

@app.route('/api/loans', methods=['POST'])
def create_loan():
    try:
        lender_id = int(request.form['lender_id'])
        borrower_id = int(request.form['borrower_id'])
        points = int(request.form['points'])
        use_year = int(request.form['use_year'])

        # Get the members first to use their names in the log
        lender = Member.query.get_or_404(lender_id)
        borrower = Member.query.get_or_404(borrower_id)

        # Validate lender has enough regular points
        lender_points = PointAllocation.query.filter_by(
            member_id=lender_id,
            use_year=use_year,
            is_banked=False
        ).first()

        if not lender_points or lender_points.points < points:
            return jsonify({'error': 'Lender does not have enough regular points available'}), 400

        # Create the loan
        loan = PointLoan(
            lender_id=lender_id,
            borrower_id=borrower_id,
            points=points,
            use_year=use_year
        )

        # Deduct points from lender
        lender_points.points -= points

        # Add points to borrower
        borrower_points = PointAllocation.query.filter_by(
            member_id=borrower_id,
            use_year=use_year,
            is_banked=False
        ).first()

        if not borrower_points:
            borrower_points = PointAllocation(
                member_id=borrower_id,
                use_year=use_year,
                points=0,
                is_banked=False
            )
            db.session.add(borrower_points)

        borrower_points.points += points

        db.session.add(loan)

        # Log the activity
        log = ActivityLog(
            action_type='points_loaned',
            description=f"{lender.name} loaned {points} points to {borrower.name} for {use_year}",
            member1_id=lender_id,
            member2_id=borrower_id,
            stay_id=None
        )
        db.session.add(log)

        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/loans/<int:loan_id>/repay', methods=['POST'])
def repay_loan(loan_id):
    try:
        loan = PointLoan.query.get_or_404(loan_id)
        if loan.status != 'active':
            return jsonify({'error': 'This loan has already been repaid'}), 400

        # Check regular points only
        borrower_points = PointAllocation.query.filter_by(
            member_id=loan.borrower_id,
            use_year=loan.use_year,
            is_banked=False
        ).first()

        if not borrower_points or borrower_points.points < loan.points:
            return jsonify({'error': f'Borrower does not have enough regular points to repay the loan. Available: {borrower_points.points if borrower_points else 0}, Needed: {loan.points}'}), 400

        # Transfer points back
        borrower_points.points -= loan.points

        lender_points = PointAllocation.query.filter_by(
            member_id=loan.lender_id,
            use_year=loan.use_year,
            is_banked=False
        ).first()

        if not lender_points:
            lender_points = PointAllocation(
                member_id=loan.lender_id,
                use_year=loan.use_year,
                points=0,
                is_banked=False
            )
            db.session.add(lender_points)

        lender_points.points += loan.points
        loan.status = 'repaid'

        # Log the activity
        log = ActivityLog(
            action_type='loan_repaid',
            description=f"{loan.borrower.name} repaid {loan.points} points to {loan.lender.name}",
            member1_id=loan.lender_id,
            member2_id=loan.borrower_id,
            stay_id=None
        )
        db.session.add(log)

        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/loans')
def view_loans():
    active_loans = PointLoan.query.filter_by(status='active').all()
    repaid_loans = PointLoan.query.filter_by(status='repaid').all()
    members = Member.query.all()
    return render_template('loans.html', active_loans=active_loans, repaid_loans=repaid_loans, members=members)

@app.route('/api/point_transfers', methods=['POST'])
def transfer_points():
    try:
        from_member_id = int(request.form['from_member_id'])
        to_member_id = int(request.form['to_member_id'])
        points = int(request.form['points'])
        use_year = int(request.form['use_year'])

        # Get the members
        from_member = Member.query.get_or_404(from_member_id)
        to_member = Member.query.get_or_404(to_member_id)

        # Validate from_member has enough regular points
        from_points = PointAllocation.query.filter_by(
            member_id=from_member_id,
            use_year=use_year,
            is_banked=False
        ).first()

        if not from_points or from_points.points < points:
            return jsonify({'error': 'Member does not have enough regular points available'}), 400

        # Transfer the points
        from_points.points -= points

        to_points = PointAllocation.query.filter_by(
            member_id=to_member_id,
            use_year=use_year,
            is_banked=False
        ).first()

        if not to_points:
            to_points = PointAllocation(
                member_id=to_member_id,
                use_year=use_year,
                points=0,
                is_banked=False
            )
            db.session.add(to_points)

        to_points.points += points

        # Record the balance
        # Always store with lower member ID as member1
        if from_member_id < to_member_id:
            member1_id, member2_id = from_member_id, to_member_id
            balance_points = -points  # When member1 transfers to member2, member2 owes points to member1
        else:
            member1_id, member2_id = to_member_id, from_member_id
            balance_points = points  # When member2 transfers to member1, member1 owes points to member2

        balance = PointBalance(
            member1_id=member1_id,
            member2_id=member2_id,
            use_year=use_year,
            points=balance_points
        )

        db.session.add(balance)

        # Log the activity
        log = ActivityLog(
            action_type='points_transferred',
            description=f"{from_member.name} transferred {points} points to {to_member.name} for {use_year}",
            member1_id=from_member_id,
            member2_id=to_member_id,
            stay_id=None
        )
        db.session.add(log)

        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/point_balances')
def view_point_balances():
    # Get all unique member pairs with their total balances by year
    balances_raw = db.session.query(
        PointBalance.member1_id,
        PointBalance.member2_id,
        PointBalance.use_year,
        db.func.sum(PointBalance.points).label('total_balance')
    ).group_by(
        PointBalance.member1_id,
        PointBalance.member2_id,
        PointBalance.use_year
    ).having(db.func.sum(PointBalance.points) != 0)  # Only show non-zero balances

    # Convert raw balances into a graph representation
    members = {member.id: member for member in Member.query.all()}
    balance_graph = {}

    for b in balances_raw:
        year = b.use_year
        if year not in balance_graph:
            balance_graph[year] = {}

        member1, member2 = members[b.member1_id], members[b.member2_id]
        balance = b.total_balance

        if member1 not in balance_graph[year]:
            balance_graph[year][member1] = {}
        if member2 not in balance_graph[year]:
            balance_graph[year][member2] = {}

        if balance > 0:  # member2 owes member1
            balance_graph[year][member2][member1] = balance
        else:  # member1 owes member2
            balance_graph[year][member1][member2] = -balance

    # Consolidate debts
    consolidated_balances = []
    for year in balance_graph:
        # For each year, try to simplify the debts
        while True:
            # Find a chain of debts that can be simplified
            simplified = False
            for debtor in balance_graph[year]:
                for creditor, amount in balance_graph[year].get(debtor, {}).items():
                    # Look for creditor's debts
                    for creditor_creditor, creditor_amount in balance_graph[year].get(creditor, {}).items():
                        # We found a chain: debtor -> creditor -> creditor_creditor
                        min_amount = min(amount, creditor_amount)
                        if min_amount > 0:
                            # Reduce the intermediate debt
                            balance_graph[year][debtor][creditor] -= min_amount
                            if balance_graph[year][debtor][creditor] == 0:
                                del balance_graph[year][debtor][creditor]
                            balance_graph[year][creditor][creditor_creditor] -= min_amount
                            if balance_graph[year][creditor][creditor_creditor] == 0:
                                del balance_graph[year][creditor][creditor_creditor]

                            # Add or update the direct debt
                            if debtor not in balance_graph[year]:
                                balance_graph[year][debtor] = {}
                            if creditor_creditor in balance_graph[year][debtor]:
                                balance_graph[year][debtor][creditor_creditor] += min_amount
                            else:
                                balance_graph[year][debtor][creditor_creditor] = min_amount

                            simplified = True
                            break
                    if simplified:
                        break
                if simplified:
                    break
            if not simplified:
                break

        # Convert the simplified graph back to a list of balances
        for debtor in balance_graph[year]:
            for creditor, amount in balance_graph[year][debtor].items():
                if amount > 0:  # Only include non-zero balances
                    consolidated_balances.append({
                        'member1': debtor,
                        'member2': creditor,
                        'use_year': year,
                        'total_balance': amount
                    })

    # Sort balances by year and amount
    consolidated_balances.sort(key=lambda x: (x['use_year'], -x['total_balance']))

    return render_template('point_balances.html',
                         balances=consolidated_balances,
                         members=members.values())

@app.route('/api/guests', methods=['POST'])
def add_guest():
    try:
        name = request.form['guest_name']
        guest = AdditionalGuest(name=name)
        db.session.add(guest)
        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/guests/<int:guest_id>', methods=['DELETE'])
def delete_guest(guest_id):
    try:
        guest = AdditionalGuest.query.get_or_404(guest_id)
        if len(guest.stays) > 0:
            return jsonify({'error': 'Cannot delete guest with stays'}), 400
        db.session.delete(guest)
        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/guests')
def manage_guests():
    additional_guests = AdditionalGuest.query.all()
    return render_template('guests.html', additional_guests=additional_guests)

@app.route('/api/undo_last_action', methods=['POST'])
def undo_last_action():
    try:
        # Skip past any 'undo' actions to find the last real action
        last_action = ActivityLog.query.filter(
            ActivityLog.action_type != 'undo'
        ).order_by(ActivityLog.id.desc()).first()

        if not last_action:
            return jsonify({'error': 'No actions to undo'}), 400

        # Check if this action has already been undone
        already_undone = ActivityLog.query.filter(
            ActivityLog.action_type == 'undo',
            ActivityLog.description.like(f'Undid action: {last_action.description}%')
        ).first()

        if already_undone:
            return jsonify({'error': 'This action has already been undone'}), 400

        if last_action.action_type == 'points_banked':
            member = Member.query.get(last_action.member1_id)
            if not member:
                return jsonify({'error': 'Member not found'}), 400

            current_year = get_use_year(date.today())

            regular_points = PointAllocation.query.filter_by(
                member_id=member.id,
                use_year=current_year,
                is_banked=False
            ).first()

            banked_points = PointAllocation.query.filter_by(
                member_id=member.id,
                use_year=current_year,
                is_banked=True
            ).first()

            if not banked_points:
                return jsonify({'error': 'Banked points allocation not found'}), 400

            try:
                points_amount = int(last_action.description.split(' banked ')[1].split(' points')[0])
            except (IndexError, ValueError):
                return jsonify({'error': 'Invalid action description format'}), 400

            # Verify banked points has enough points to return
            if banked_points.points < points_amount:
                return jsonify({'error': 'Not enough banked points to undo this action'}), 400

            if not regular_points:
                regular_points = PointAllocation(
                    member_id=member.id,
                    use_year=current_year,
                    points=0,
                    is_banked=False
                )
                db.session.add(regular_points)

            regular_points.points += points_amount
            banked_points.points -= points_amount

        elif last_action.action_type == 'stay_booked':
            stay = Stay.query.get(last_action.stay_id)
            if not stay:
                return jsonify({'error': 'Stay not found'}), 400

            if stay.status != 'booked':
                return jsonify({'error': 'Stay is not in booked status'}), 400

            stay.status = 'planned'

            # Return points to members
            use_year = get_use_year(stay.check_in)
            for stay_member in stay.members:
                point_allocation = PointAllocation.query.filter_by(
                    member_id=stay_member.member_id,
                    use_year=use_year,
                    is_banked=False
                ).first()

                if not point_allocation:
                    point_allocation = PointAllocation(
                        member_id=stay_member.member_id,
                        use_year=use_year,
                        points=0,
                        is_banked=False
                    )
                    db.session.add(point_allocation)

                point_allocation.points += stay_member.points_share

        elif last_action.action_type == 'stay_created':
            stay = Stay.query.get(last_action.stay_id)
            if not stay:
                return jsonify({'error': 'Stay not found'}), 400

            # If stay was booked, return points first
            if stay.status == 'booked':
                use_year = get_use_year(stay.check_in)
                for stay_member in stay.members:
                    point_allocation = PointAllocation.query.filter_by(
                        member_id=stay_member.member_id,
                        use_year=use_year,
                        is_banked=False
                    ).first()

                    if point_allocation:
                        point_allocation.points += stay_member.points_share

            # Remove guest associations
            stay.additional_guests = []

            # Delete associated stay members
            StayMember.query.filter_by(stay_id=stay.id).delete()
            db.session.delete(stay)

        else:
            return jsonify({'error': f'Cannot undo action type: {last_action.action_type}'}), 400

        # Log the undo action with timestamp reference
        undo_log = ActivityLog(
            action_type='undo',
            description=f"Undid action: {last_action.description} (original timestamp: {last_action.timestamp})",
            member1_id=last_action.member1_id,
            member2_id=last_action.member2_id,
            stay_id=last_action.stay_id
        )
        db.session.add(undo_log)
        db.session.commit()

        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/stays/<int:stay_id>', methods=['GET'])
def get_stay(stay_id):
    stay = Stay.query.get_or_404(stay_id)

    # Get guest point allocations
    stay.guest_points = {}
    for guest in stay.additional_guests:
        guest_points = GuestPoints.query.filter_by(
            stay_id=stay.id,
            guest_id=guest.id
        ).all()

        stay.guest_points[guest.id] = {
            'total': sum(gp.points for gp in guest_points),
            **{gp.member_id: gp.points for gp in guest_points}
        }

    return jsonify(stay.to_dict())

@app.route('/stays/new', methods=['GET', 'POST'])
def new_stay():
    if request.method == 'POST':
        try:
            print("Form data received:", request.form)  # Debug print

            # Create new stay
            stay = Stay(
                resort=request.form['resort'],
                check_in=datetime.strptime(request.form['check_in'], '%Y-%m-%d'),
                check_out=datetime.strptime(request.form['check_out'], '%Y-%m-%d'),
                points_cost=int(request.form['points_cost']),
                status=request.form['status']
            )
            db.session.add(stay)
            db.session.flush()  # Get the stay ID

            # Handle member point shares
            user_ids = request.form.getlist('user_ids[]')
            point_shares = request.form.getlist('point_shares[]')

            for i, user_id in enumerate(user_ids):
                if not user_id.startswith('member_'):
                    continue
                member_id = int(user_id.replace('member_', ''))
                points = int(point_shares[i])
                if points > 0:
                    stay_member = StayMember(
                        stay_id=stay.id,
                        member_id=member_id,
                        points_share=points
                    )
                    db.session.add(stay_member)

            # Handle guest point shares
            guest_data = {}
            for key, value in request.form.items():
                if key.startswith('guest_points['):
                    match = re.match(r'guest_points\[(\d+)\]\[(\d+)\]', key)
                    if match and int(value) > 0:  # Only process non-zero points
                        guest_id = int(match.group(1))
                        member_id = int(match.group(2))

                        if guest_id not in guest_data:
                            guest_data[guest_id] = {}
                        guest_data[guest_id][member_id] = int(value)

            # Create StayGuest and GuestPoints entries
            for guest_id, member_points in guest_data.items():
                if any(points > 0 for points in member_points.values()):
                    # Add the guest to the stay
                    stay_guest = StayGuest(
                        stay_id=stay.id,
                        guest_id=guest_id
                    )
                    db.session.add(stay_guest)
                    db.session.flush()  # Get the stay_guest ID

                    # Add the point allocations for each member
                    for member_id, points in member_points.items():
                        if points > 0:
                            guest_points = GuestPoints(
                                stay_guest_id=stay_guest.id,
                                member_id=member_id,
                                points=points
                            )
                            db.session.add(guest_points)

                    # Also add the guest to the stay's additional_guests relationship
                    guest = AdditionalGuest.query.get(guest_id)
                    if guest not in stay.additional_guests:
                        stay.additional_guests.append(guest)

            # Log the activity
            log_entry = ActivityLog(
                action_type='create_stay',
                description=f'Created stay at {stay.resort}',
                stay_id=stay.id,
                timestamp=datetime.now()
            )
            db.session.add(log_entry)

            db.session.commit()
            flash('Stay created successfully', 'success')
            return redirect(url_for('home'))

        except Exception as e:
            db.session.rollback()
            flash(f'Error creating stay: {str(e)}', 'error')
            print(f"Error details: {str(e)}")  # Debug print
            return redirect(url_for('home'))

    # GET request - show the form
    members = Member.query.all()
    additional_guests = AdditionalGuest.query.all()
    return render_template('stay_form.html',
                         stay=None,
                         members=members,
                         additional_guests=additional_guests,
                         stay_members={},
                         stay_guests={},
                         guest_points={})

@app.route('/stays/<int:stay_id>/edit', methods=['GET', 'POST'])
def edit_stay(stay_id):
    stay = Stay.query.get_or_404(stay_id)

    if request.method == 'POST':
        try:
            # Update stay details
            stay.resort = request.form['resort']
            stay.check_in = datetime.strptime(request.form['check_in'], '%Y-%m-%d')
            stay.check_out = datetime.strptime(request.form['check_out'], '%Y-%m-%d')
            stay.points_cost = int(request.form['points_cost'])
            stay.status = request.form['status']

            # Clear existing relationships
            StayMember.query.filter_by(stay_id=stay_id).delete()
            StayGuest.query.filter_by(stay_id=stay_id).delete()

            # Handle member point shares
            user_ids = request.form.getlist('user_ids[]')
            point_shares = request.form.getlist('point_shares[]')

            for i, user_id in enumerate(user_ids):
                if not user_id.startswith('member_'):
                    continue
                member_id = int(user_id.replace('member_', ''))
                points = int(point_shares[i])
                if points > 0:
                    stay_member = StayMember(
                        stay_id=stay_id,
                        member_id=member_id,
                        points_share=points
                    )
                    db.session.add(stay_member)

            # Handle guest point shares
            for key in request.form:
                if key.startswith('guest_points['):
                    match = re.match(r'guest_points\[(\d+)\]\[(\d+)\]', key)
                    if match:
                        guest_id = int(match.group(1))
                        member_id = int(match.group(2))
                        points = int(request.form[key])

                        if points > 0:
                            stay_guest = StayGuest(
                                stay_id=stay_id,
                                guest_id=guest_id
                            )
                            db.session.add(stay_guest)
                            db.session.flush()

                            guest_points = GuestPoints(
                                stay_guest_id=stay_guest.id,
                                member_id=member_id,
                                points=points
                            )
                            db.session.add(guest_points)

            # Log the activity
            log_entry = ActivityLog(
                action_type='update_stay',
                description=f'Updated stay at {stay.resort}',
                stay_id=stay_id,
                timestamp=datetime.now()
            )
            db.session.add(log_entry)

            db.session.commit()
            flash('Stay updated successfully', 'success')
            return redirect(url_for('home'))

        except Exception as e:
            db.session.rollback()
            flash(f'Error updating stay: {str(e)}', 'error')
            return redirect(url_for('home'))

    # Prepare data for the form
    members = Member.query.all()
    additional_guests = AdditionalGuest.query.all()

    # Get existing member point shares
    stay_members = {sm.member_id: sm.points_share for sm in stay.members}

    # Get existing guest data
    stay_guests = {}
    guest_points = {}

    for stay_guest in stay.stay_guests:
        stay_guests[stay_guest.guest_id] = True
        guest_points[stay_guest.guest_id] = {}

        for member_point in stay_guest.member_points:
            guest_points[stay_guest.guest_id][member_point.member_id] = member_point.points

    print("Debug - Stay:", stay.resort)
    print("Debug - Stay Members:", stay_members)
    print("Debug - Stay Guests:", stay_guests)
    print("Debug - Guest Points:", guest_points)
    print("Debug - Additional Guests:", [g.name for g in stay.additional_guests])

    return render_template('stay_form.html',
                         stay=stay,
                         members=members,
                         additional_guests=additional_guests,
                         stay_members=stay_members,
                         stay_guests=stay_guests,
                         guest_points=guest_points)

class StayGuest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stay_id = db.Column(db.Integer, db.ForeignKey('stay.id'), nullable=False)
    guest_id = db.Column(db.Integer, db.ForeignKey('additional_guest.id'), nullable=False)
    guest = db.relationship('AdditionalGuest')
    member_points = db.relationship('GuestPoints', backref='stay_guest', lazy=True)

class GuestPoints(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stay_guest_id = db.Column(db.Integer, db.ForeignKey('stay_guest.id'), nullable=False)
    member_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)
    member = db.relationship('Member')

def calculate_points_used(member_id, year):
    """Calculate total points used by a member in a given year, including guest contributions"""
    total_points = 0

    # Get points from direct stay memberships
    stay_points = db.session.query(
        func.sum(StayMember.points_share)
    ).join(Stay).filter(
        StayMember.member_id == member_id,
        extract('year', Stay.check_in) == year
    ).scalar() or 0

    # Get points contributed to guests
    guest_points = db.session.query(
        func.sum(GuestPoints.points)
    ).join(
        StayGuest, GuestPoints.stay_guest_id == StayGuest.id
    ).join(
        Stay, StayGuest.stay_id == Stay.id
    ).filter(
        GuestPoints.member_id == member_id,
        extract('year', Stay.check_in) == year
    ).scalar() or 0

    total_points = stay_points + guest_points

    return total_points

def init_db():
    with app.app_context():
        # Create all tables
        db.drop_all()
        db.create_all()

        # Create contract
        contract = Contract(use_year_start=9, total_points=230)  # September, 230 points
        db.session.add(contract)

        # Create family members
        brian = Member(name='Brian')
        rachel = Member(name='Rachel')
        parents = Member(name='Parents')
        db.session.add_all([brian, rachel, parents])
        db.session.flush()  # Generate IDs

        current_year = get_use_year(date.today())

        # Create point allocations for current use year
        # Regular points
        allocations = [
            PointAllocation(member_id=brian.id, use_year=current_year, points=77, is_banked=False),
            PointAllocation(member_id=rachel.id, use_year=current_year, points=77, is_banked=False),
            PointAllocation(member_id=parents.id, use_year=current_year, points=76, is_banked=False),
        ]

        # Banked points from previous year
        banked_allocations = [
            PointAllocation(member_id=brian.id, use_year=current_year, points=75, is_banked=True),
            PointAllocation(member_id=rachel.id, use_year=current_year, points=75, is_banked=True),
            PointAllocation(member_id=parents.id, use_year=current_year, points=76, is_banked=True),
        ]

        db.session.add_all(allocations)
        db.session.add_all(banked_allocations)
        db.session.commit()

        # Create some sample additional guests
        grammy = AdditionalGuest(name='Grammy')
        aunt_jane = AdditionalGuest(name='Aunt Jane')
        db.session.add_all([grammy, aunt_jane])
        db.session.commit()

if __name__ == '__main__':
    # Delete the database file if it exists
    if os.path.exists('dvc_points.db'):
        os.remove('dvc_points.db')

    init_db()  # Initialize database with test data
    app.run(debug=True)  # Added debug=True to see any errors
